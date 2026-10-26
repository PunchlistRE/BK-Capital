// The Property Editor: seven tabs with sub-tabs; every control writes the deal field the rest of the app reads, and the numbers on it are the engine's own.
//   node audit/editor_test.js index.html
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); const path = require('path');
const A = require(path.join(__dirname, 'deal.js')), D = require(path.join(__dirname, 'devdeal.js'));
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined }); const p = await (await b.newContext({ viewport: { width: 1440, height: 1000 } })).newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message)); await p.route(/supabase\.co|vercel\.app|fonts\.g/, r => r.abort());
  await p.goto('file://' + path.resolve(process.argv[2])); await p.waitForTimeout(700);
  let checks = 0, fails = 0; const check = (n, ok, d) => { checks++; if (!ok) { fails++; console.log('FAIL ' + n + (d ? '  ' + d : '')); } };
  const fresh = (deal) => p.evaluate(a => { document.documentElement.classList.add('bk-auth-ok'); bkCreateNewDeal(a); }, deal);
  const set = async (id, v) => { await p.fill('#' + id, String(v)); await p.dispatchEvent('#' + id, 'change'); await p.waitForTimeout(150); };
  const go = (tab, sub) => p.evaluate(([t, s]) => bkEdGo(t, t, s), [tab, sub]);
  const st = () => p.evaluate(() => bkLoad());
  for (const [tag, deal] of [['acquisition', A], ['development', D]]) {
    await fresh(deal);
    const r = await p.evaluate(() => { const o = []; for (const t of bkEditorTabs) for (const [id] of t.subs) { bkEdGo(t.id, t.id, id); const v = document.querySelector('#viewport'); o.push({ k: t.id + '/' + id, panels: v.querySelectorAll('.ae-panel').length, bad: (v.innerText.match(/undefined|\bNaN\b|\[object|Infinity/g) || []).length, tabs: v.querySelectorAll('.ae-tab').length, on: (v.querySelector('.ae-sub.on') || {}).textContent }); } return o; });
    check(tag + ': all 29 sub-tabs of the 7 tabs render a panel with no undefined, NaN or object text', r.length === 29 && r.every(x => x.panels > 0 && x.bad === 0 && x.tabs === 7), JSON.stringify(r.filter(x => !x.panels || x.bad)));
  }
  await fresh(A);
  check('the Property Editor is a navigation group of seven sheets right after Overview', await p.evaluate(() => { const g = GROUPS[1]; return g.id === 'editor' && g.sheets.join() === 'Property,Market,Revenues,Expenses,Tenants,Investment,Valuation' && NAV_TABS[1].id === 'editor'; }));
  await p.evaluate(() => showSheet('Property')); await p.waitForTimeout(200);
  await p.click('.ae-tab:has-text("Expenses")'); await p.waitForTimeout(250);
  check('clicking a tab opens that sheet, and a sub-tab choice is remembered', await p.evaluate(() => currentSheet === 'Expenses') && (await p.click('.ae-sub:has-text("Capital")'), await p.waitForTimeout(250), await p.evaluate(() => { showSheet('Market'); showSheet('Expenses'); return document.querySelector('.ae-sub.on').textContent === 'Capital'; })));
  /* Property */
  await go('Property', 'desc'); await set('ae-name', 'Editor Test Court'); check('Property > Description writes the property name', (await st()).name === 'Editor Test Court');
  await go('Property', 'area'); await set('ae-units', 100); check('Property > Area Measures writes units', (await st()).units === 100);
  await go('Property', 'analysis'); await set('ae-holdYears', 7); check('Property > Analysis writes the length of analysis', (await st()).holdYears === 7);
  /* Market: inflation by year */
  await go('Market', 'infl'); await set('ae-def-rent', '4'); check('Market > Inflation: the Default column writes the single growth rate', Math.abs((await st()).rentGrowth - 0.04) < 1e-12);
  await set('ae-cv-rent-3', '6'); let s = await st(); check('a year entry writes the curve and leaves the other years blank', s.growthCurves && s.growthCurves.rent[2] === 0.06 && s.growthCurves.rent[0] === null && s.growthCurves.rent[1] === null, JSON.stringify(s.growthCurves));
  const g1 = await p.evaluate(() => bkAnnualCF().monthly.map(x => x.resRev)); await set('ae-cv-rent-3', ''); const g2 = await p.evaluate(() => bkAnnualCF().monthly.map(x => x.resRev)); s = await st();
  check('clearing the year entry removes the curve and the engine goes back to the single rate', !s.growthCurves && g1[30] > g2[30], String(s.growthCurves));
  await set('ae-def-rent', '3');
  /* Revenues, misc income */
  const before = await p.evaluate(() => ({ other: bkCalc().other, egi: bkCalc().egi })); await go('Revenues', 'misc'); await p.click('button:has-text("Add a line")'); await p.waitForTimeout(200);
  await set('ae-misc-name-0', 'Roof Antenna'); await set('ae-misc-amt-0', '15,000'); const after = await p.evaluate(() => ({ other: bkCalc().other, egi: bkCalc().egi, txt: document.querySelector('#viewport').innerText }));
  check('a miscellaneous line of $15,000 a year adds $15,000 to other income and to EGI, and shows in the revenue build', Math.abs(after.other - before.other - 15000) < 1e-6 && Math.abs(after.egi - before.egi - 15000) < 1e-6 && /\$15,000/.test(after.txt), JSON.stringify([after.other - before.other, after.egi - before.egi]));
  /* Expenses: how-input conversions */
  await go('Expenses', 'op'); await p.selectOption('#viewport tr:has-text("Insurance") select >> nth=0', 'DOLLARS_UNIT_YR'); await p.waitForTimeout(200); await set('ae-line-insurance', 1000); s = await st();
  check('Expenses > Operating: $1,000 per unit a year on 100 units is stored as $100,000 a year', s.insurance === 100000 && s._basis.insurance === 'DOLLARS_UNIT_YR', String(s.insurance));
  await p.selectOption('#viewport tr:has-text("Insurance") select >> nth=1', 'Monthly'); await p.waitForTimeout(200); await set('ae-line-insurance', 2000); s = await st();
  check('monthly frequency multiplies by twelve: $2,000 a month per unit on 100 units is $2,400,000 a year', s.insurance === 2400000, String(s.insurance));
  await set('ae-line-insurance', 1000); await p.selectOption('#viewport tr:has-text("Insurance") select >> nth=1', 'Annually'); await p.selectOption('#viewport tr:has-text("Insurance") select >> nth=0', 'DOLLARS_YR'); await p.waitForTimeout(150); await set('ae-line-insurance', 96000);
  check('the Year 1 expense summary equals the engine\'s own figures', await p.evaluate(() => { const c = bkCalc(), t = document.querySelector('#viewport').innerText; const f = n => '$' + Math.round(n).toLocaleString('en-US'); return t.includes(f(c.total)) && t.includes(f(c.noi)) && t.includes(f(c.after)); }));
  await set('ae-line-mgmtPct', '4'); check('the management fee percentage writes as a decimal', Math.abs((await st()).mgmtPct - 0.04) < 1e-12);
  /* Expenses: capital items move cash flow, never NOI */
  const nb = await p.evaluate(() => ({ noi: bkCalc().noi, irr: bkMonthlyReturns().irr, cf: bkMonthlyReturns().rows.map(r => r.cf) })); await go('Expenses', 'cap'); await p.click('button:has-text("Add a capital item")'); await p.waitForTimeout(200);
  await set('ae-cap-name-0', 'Roof repair'); await p.fill('#ae-cap-month-0', '2027-07'); await p.dispatchEvent('#ae-cap-month-0', 'change'); await p.waitForTimeout(150); await set('ae-cap-amt-0', 55000);
  const na = await p.evaluate(() => ({ noi: bkCalc().noi, irr: bkMonthlyReturns().irr, cf: bkMonthlyReturns().rows.map(r => r.cf), txt: document.querySelector('#viewport').innerText }));
  check('a $55,000 capital item lowers one month\'s cash flow by exactly that and the return, and leaves NOI alone', Math.abs(na.noi - nb.noi) < 1e-9 && na.irr < nb.irr && nb.cf.filter((v, i) => Math.abs(v - na.cf[i] - 55000) < 1e-6).length === 1 && /month 7/.test(na.txt), String(nb.cf.filter((v, i) => Math.abs(v - na.cf[i] - 55000) < 1e-6).length));
  /* Investment and Valuation */
  await go('Investment', 'fin'); await set('ae-acqLTV', '55'); check('Investment > Financing writes the loan-to-value as a decimal', Math.abs((await st()).acqLTV - 0.55) < 1e-12);
  await p.selectOption('#viewport select >> nth=0', 'false'); await p.waitForTimeout(200); check('switching Debt to Off sets the engine\'s unlevered switch', (await st()).debtEnabled === false && await p.evaluate(() => bkDebt().loan === 0));
  await p.selectOption('#viewport select >> nth=0', 'true'); await p.waitForTimeout(200);
  await go('Valuation', 'exit'); await set('ae-exitCap', '6.5'); check('Valuation > Exit writes the exit cap', Math.abs((await st()).exitCap - 0.065) < 1e-12);
  await go('Valuation', 'sum'); check('the Value and Returns tab shows the engine\'s own levered and unlevered IRR', await p.evaluate(() => { const t = document.querySelector('#viewport').innerText, m = bkMonthlyReturns(), a = bkAnnualCF(); return t.includes((m.irr * 100).toFixed(2) + '%') && t.includes((a.irr * 100).toFixed(2) + '%'); }));
  /* templates */
  await go('Property', 'tpl'); await set('ae-tpl-name', 'Garden test'); await p.click('button:has-text("Save template")'); await p.waitForTimeout(250);
  const saved = await p.evaluate(() => JSON.parse(localStorage.getItem('bkcapital.templates.v1') || '[]')); check('Save as template keeps rates and per-unit expenses, never the name, price or units', saved.length === 1 && saved[0].values.exitCap === 0.065 && !('name' in saved[0].values) && !('purchasePrice' in saved[0].values) && !('units' in saved[0].values) && saved[0].perUnit.payroll > 0, JSON.stringify(Object.keys(saved[0] || {})));
  await fresh(Object.assign({}, A, { name: 'Second', dealId: 'SEC-1', units: 50 })); await go('Property', 'tpl'); await p.evaluate(() => { window.confirm = () => true; }); await p.click('button:has-text("Apply to this deal")'); await p.waitForTimeout(300); s = await st();
  check('applying the template brings the rates across and scales expenses per unit to the new deal\'s units', s.exitCap === 0.065 && s.name === 'Second' && s.units === 50 && Math.abs(s.payroll - saved[0].perUnit.payroll * 50) < 0.02, [s.exitCap, s.name, s.payroll].join());
  await p.evaluate(() => localStorage.removeItem('bkcapital.templates.v1'));
  check('no page errors', errs.length === 0, errs.join(' | '));
  await b.close(); console.log(checks + ' checks, ' + fails + ' failures'); process.exit(fails ? 1 : 0);
})();
