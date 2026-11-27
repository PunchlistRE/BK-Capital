// Guide 2.0, phase 2b (owner-approved): the debt and tax lenses of the deal review (src/225). Debt and tax come first after "what deserves attention first": each is a short structured list of figures the model already
// calculates, with a status taken only from signals the model already raises (a Model Check that is firing, a blank required / needed / expected input, an engine error). No rule of the guide's own, nothing written.
//   node audit/deal_lenses_test.js index.html
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); const path = require('path');
const A = require(path.join(__dirname, 'deal.js')), D = require(path.join(__dirname, 'devdeal.js'));
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  let checks = 0, fails = 0; const check = (n, ok, d) => { checks++; if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? '  [' + String(d).slice(0, 500) + ']' : '')); };
  const open = async (deal) => { const ctx = await b.newContext({ viewport: { width: 1300, height: 1000 } }), p = await ctx.newPage(); p.errs = []; p.reqs = []; p.on('pageerror', e => p.errs.push(e.message)); p.on('request', r => { if (!/^(file|data|blob):/.test(r.url())) p.reqs.push(r.url()); });
    await p.route(/supabase\.co|vercel\.app|fonts\.g|cdn\.jsdelivr|newyorkfed/, r => r.abort()); await p.goto('file://' + path.resolve(process.argv[2])); await p.waitForTimeout(700);
    await p.evaluate((d) => { document.documentElement.classList.add('bk-auth-ok'); bkCreateNewDeal(d); }, deal); return p; };
  const patch = (p, x) => p.evaluate((x) => { const s = bkLoad(); Object.assign(s, x); bkSave(s); }, x);
  const lens = (p, n) => p.evaluate((n) => JSON.parse(JSON.stringify(bkLens(n).rows)), n);
  const row = (rows, label) => rows.find(r => r.label === label) || {};
  const M = (v) => '$' + (Math.abs(v) >= 1e6 ? (Math.abs(v) / 1e6).toFixed(2) + 'M' : Math.round(Math.abs(v)).toLocaleString('en-US'));

  const p = await open(A);
  const dl = await lens(p, 'debt'), tl = await lens(p, 'tax');
  check('the debt lens and the tax lens each list their rows: the loan, how it was sized, the rate, repayment, maturity and sale, prepayment; basis, recovery, cost segregation, rates, what tax does, losses', ['The loan', 'How it was sized', 'Interest rate', 'How it is repaid', 'Maturity and the modeled sale', 'Prepayment and exit costs'].every(l => row(dl, l).label) && ['Depreciable basis', 'Recovery period', 'Cost segregation and bonus', 'Tax rates', 'What tax does to the return', 'Losses'].every(l => row(tl, l).label), dl.map(r => r.label).join('|') + ' // ' + tl.map(r => r.label).join('|'));

  /* ---- the figures are the model's, checked against the engine ---- */
  const e = await p.evaluate(() => { const d = bkDebt(), a = bkAfterTaxV18(), dp = bkDepreciation(); return { loan: d.loan, ltv: d.ltv, dscr: d.dscr, bind: d.binding, atSale: d.debtAtSale, fee: d.fee, pre: a.preTaxIRR, at: a.atIRR, saleTax: a.saleTax, accum: a.accumDepr, life: a.life, basis: dp.depreciableBasis, price: dp.purchasePrice }; });
  const pc = (v, d) => (v * 100).toFixed(d == null ? 2 : d) + '%';
  check('the loan, the sizing, the repayment and the sale balance are the engine\'s figures (loan, loan-to-value, DSCR, binding test, balance at sale)', row(dl, 'The loan').value.includes(M(e.loan)) && row(dl, 'The loan').value.includes(M(e.fee)) && row(dl, 'How it was sized').value.includes('Sized by ' + e.bind) && row(dl, 'How it was sized').value.includes(pc(e.ltv, 1)) && row(dl, 'How it was sized').value.includes(e.dscr.toFixed(2) + 'x') && row(dl, 'How it is repaid').value.includes(M(e.atSale)), JSON.stringify([row(dl, 'The loan').value, row(dl, 'How it was sized').value]));
  check('the tax rows are the engines\' figures (depreciable basis, recovery period, pre- and after-tax IRR, tax at the sale, accumulated depreciation)', row(tl, 'Depreciable basis').value.includes(M(e.basis)) && row(tl, 'Recovery period').value.startsWith(e.life + ' years') && row(tl, 'What tax does to the return').value.includes(pc(e.pre) + ' before tax, ' + pc(e.at) + ' after tax') && row(tl, 'What tax does to the return').value.includes(M(e.saleTax)) && row(tl, 'What tax does to the return').value.includes(M(e.accum)), row(tl, 'What tax does to the return').value);

  /* ---- a status comes only from a signal the model raises ---- */
  check('on a clean deal no row is flagged by a rule the lens made up: a row is "look" only when a Model Check named on it fires, and "missing" only for a blank input', [...dl, ...tl].every(r => (r.status !== 'look' || (r.rules.length && r.messages.length)) && (r.status !== 'missing' || r.blank.length)), JSON.stringify([...dl, ...tl].filter(r => r.status === 'look' || r.status === 'missing').map(r => [r.label, r.status, r.rules])));
  await patch(p, { debtTerm: 10, holdYears: 3, prepayType: 'Yield maintenance', prepayLockoutMonths: 36 });
  const lk = row(await lens(p, 'debt'), 'Maturity and the modeled sale');
  check('a sale inside the prepayment lockout flags the "Maturity and the modeled sale" row from the Model Check that fires (debt.sale-in-lockout), with its message', lk.status === 'look' && lk.rules.includes('debt.sale-in-lockout') && /lockout/.test(lk.messages.join(' ')) && /does not price that/.test(lk.value), JSON.stringify([lk.status, lk.rules]));
  await patch(p, { prepayLockoutMonths: 0, holdYears: 5 });
  check('and clears when the check stops firing', row(await lens(p, 'debt'), 'Maturity and the modeled sale').status === 'ok');
  await patch(p, { debtRateType: 'Floating', debtIndexRate: 0.04, debtSpread: 0.02, rateCapStrike: 0, debtIndexName: 'SOFR', debtIndexTenor: 'Overnight SOFR', debtIndexDate: '2026-11-25', closing: '1/1/2027' });
  const fl = row(await lens(p, 'debt'), 'Interest rate');
  check('a floating loan with no cap is flagged by debt.floating-unhedged, and the rate row says how the rate is built (index plus spread)', fl.status === 'look' && fl.rules.includes('debt.floating-unhedged') && /Floating: .* plus 2\.00% = 6\.00%/.test(fl.value), JSON.stringify([fl.status, fl.rules, fl.value]));
  await patch(p, { debtIndexDate: '2026-02-01' });
  const st = await p.evaluate(() => ({ gap: bkIndexDateGap(bkLoad()), r: bkLens('debt').rows.find(r => r.label === 'Interest rate') }));
  check('a benchmark dated far from the closing is flagged with the same day count the rate card uses (one definition, bkIndexDateGap)', st.gap && st.gap.stale && st.r.status === 'look' && st.r.messages.join(' ').includes(Math.abs(st.gap.days) + ' days') && st.r.value.includes(Math.abs(st.gap.days) + ' days'), JSON.stringify([st.gap, st.r.messages]));
  await patch(p, { debtRateType: 'Fixed', rateCapStrike: 0 });
  await patch(p, { acqRate: '' });
  const nr = row(await lens(p, 'debt'), 'Interest rate');
  check('a blank interest rate on a fixed loan reads Missing (the registry says the loan terms are needed)', nr.status === 'missing' && nr.blank.includes('acqRate'), JSON.stringify([nr.status, nr.blank]));
  await patch(p, { acqRate: A.acqRate });
  await patch(p, { debtEnabled: false });
  const off = await lens(p, 'debt');
  check('with debt switched off the debt lens says so and lists nothing else', off.length === 1 && /Switched off/.test(off[0].value), JSON.stringify(off.map(r => r.label)));
  await patch(p, { debtEnabled: true });

  /* ---- tax signals ---- */
  await p.evaluate(() => { bkDeprSet('costSeg', true); bkDeprSet('landMethod', 'percent'); bkDeprSet('landPct', 0); });
  const lz = row(await lens(p, 'tax'), 'Depreciable basis');
  check('land at zero with cost segregation is flagged by dep.land-zero on the basis row', lz.status === 'look' && lz.rules.includes('dep.land-zero'), JSON.stringify([lz.status, lz.rules]));
  await p.evaluate(() => { bkDeprSet('landPct', 0.2); bkDeprSet('costSeg', false); });
  await patch(p, { taxRate: 0.37, depRecaptureRate: 0.4 });
  const ro = row(await lens(p, 'tax'), 'Tax rates');
  check('a recapture rate above the ordinary rate is flagged by tax.rate-order', ro.status === 'look' && ro.rules.includes('tax.rate-order'), JSON.stringify([ro.status, ro.rules]));
  await patch(p, { taxRate: 0.30, depRecaptureRate: 0.25, capGainsRate: 0.2 });
  const rn = row(await lens(p, 'tax'), 'Tax rates');
  check('rates that are not the model\'s defaults carry no default note', rn.status === 'ok' && !/default rates/.test(rn.value), rn.value);
  await p.context().close();

  /* ---- it changes nothing (the after-tax engine writes default rates into a deal the first time it runs; the lens must not) ---- */
  const p2 = await open(A); await p2.waitForTimeout(2500);
  const pre = await p2.evaluate(() => ({ has: bkLoad().taxRate, snap: JSON.stringify(bkLoad()) }));
  const d1 = await p2.evaluate(() => JSON.stringify([bkLens('debt'), bkLens('tax')])), d2 = await p2.evaluate(() => JSON.stringify([bkLens('debt'), bkLens('tax')]));
  const post = await p2.evaluate(() => ({ has: bkLoad().taxRate, snap: JSON.stringify(bkLoad()) }));
  check('reading the lenses writes nothing to the deal, even though the after-tax engine would fill in default rates (the rates stay unset)', pre.has === undefined && post.has === undefined && pre.snap === post.snap);
  check('the lenses are the same every time, and make no network request', d1 === d2 && p2.reqs.length === 0, p2.reqs.join(' '));
  const tr = row(JSON.parse(d1)[1].rows, 'Tax rates');
  check('on a deal with no tax rates entered the tax lens says the rates shown are the model\'s defaults (37%, 25%, 20%) and to confirm them', /model's default rates \(37%, 25%, 20%\)/.test(tr.value) && /confirm they are yours/.test(tr.value), tr.value);

  /* ---- the review shows them, after attention and before what is known ---- */
  const g = await p2.evaluate(async () => { bkGuideOn(); bkGuideWhere(); await new Promise(r => setTimeout(r, 900)); const t = document.querySelector('.gd').innerText, a = t.indexOf('What deserves attention first'), l = t.indexOf('Debt and tax'), k = t.indexOf('What is known'); return { order: a > -1 && l > a && k > l, lenses: [...document.querySelectorAll('details.bk-rv-lens')].map(d => d.dataset.lens), btn: [...document.querySelectorAll('details.bk-rv-lens .bk-btn')].length }; });
  check('the guide\'s review shows the Debt and Tax lenses right after what deserves attention first, each with Open buttons', g.order && g.lenses.join() === 'debt,tax' && g.btn >= 6, JSON.stringify(g));
  await p2.evaluate(() => bkGuideField('debtTerm')); await p2.waitForTimeout(1500);
  const o = await p2.evaluate(() => ({ guide: document.documentElement.classList.contains('bk-guide'), flash: !!document.querySelector('.bk-ask-flash') || !!document.querySelector('#viewport [data-bk-key="debtTerm"]') }));
  check('Open on a lens row leaves the guide and lands on the real box', !o.guide && o.flash, JSON.stringify(o));
  await p2.context().close();

  /* ---- a development deal reads the construction facility and the takeout ---- */
  const pd = await open(D);
  const dd = await lens(pd, 'debt'), dt = await lens(pd, 'tax');
  const dv = await pd.evaluate(() => { const t = bkDevTakeoutV11(); return { commit: t.commit, perm: t.permLoan }; });
  check('a development deal\'s debt lens reads its construction facility and permanent takeout from the development engine, not the acquisition loan', row(dd, 'Construction facility').value.includes(M(dv.commit)) && row(dd, 'Permanent loan after takeout').label && !dd.some(r => r.label === 'The loan'), dd.map(r => r.label).join('|'));
  check('no NaN, undefined or [object] on a development deal\'s lenses, and no page errors', !/undefined|NaN|\[object/.test(JSON.stringify([dd, dt])) && pd.errs.length === 0 && p.errs.length === 0, pd.errs.join('|'));
  await pd.context().close();
  console.log('deal lenses: ' + checks + ' checks, ' + fails + ' failures'); await b.close(); process.exit(fails ? 1 : 0);
})();
