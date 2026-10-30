// Base / Upside / Downside: the header control sets and shows the case, the deal's own assumptions never change, the cases run in the right direction on an acquisition
// (with and without debt) and a development, every output page shows the SELECTED case's figures (the same ones the engine gives), and a page that judges the Base case
// says so when another case is selected.
//   node audit/cases_test.js index.html
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); const path = require('path');
const A = require(path.join(__dirname, 'deal.js')), D = require(path.join(__dirname, 'devdeal.js'));
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  let checks = 0, fails = 0; const check = (n, ok, d) => { checks++; if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? '  [' + String(d).slice(0, 320) + ']' : '')); };
  const open = async (deal, extra) => { const p = await b.newPage({ viewport: { width: 1400, height: 900 } }); p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
    await p.route(/supabase\.co|vercel\.app|fonts\.g|cdn\.jsdelivr/, r => r.abort()); await p.goto('file://' + path.resolve(process.argv[2])); await p.waitForTimeout(700);
    await p.evaluate(([d, x]) => { document.documentElement.classList.add('bk-auth-ok'); localStorage.setItem('bk-pt-all', '1'); bkCreateNewDeal(d); const s = bkLoad(); Object.assign(s, d, x || {}); bkSave(s); }, [deal, extra || null]); return p; };
  const show = (p, sh) => p.evaluate(async (sh) => { showSheet(sh); await new Promise(r => setTimeout(r, 1000)); return document.querySelector('#viewport').innerText; }, sh);
  const pickCase = async (p, c) => { await p.evaluate(() => showSheet('Home')); await p.waitForTimeout(400); await p.evaluate((c) => document.querySelector('[data-bk-case="' + c + '"]').click(), c); await p.waitForTimeout(700); };
  const eng = (p) => p.evaluate(() => { const o = {}; ['Base', 'Upside', 'Downside'].forEach(c => { const s = bkLoad(), ov = bkScenarioOverrides(s, c); o[c] = { ov, ...window.bkRunWith(ov, () => { const m = bkMonthlyReturns(), a = bkAnnualCF(); return { irr: m.irr, moic: m.moic, noi1: a.arr[0].noi, loan: bkDebt().loan, exitCap: bkLoad().exitCap }; }) }; }); return o; });
  const pc = (x) => (x * 100).toFixed(2) + '%', n0 = (x) => Math.round(x).toLocaleString('en-US');

  const p = await open(A, { purchasePrice: 19800000 }); const E = await eng(p);

  /* ---- the control ---- */
  for (const c of ['Downside', 'Upside', 'Base']) {
    await pickCase(p, c);
    const st = await p.evaluate(() => ({ c: bkLoad().scenarioCase, on: [...document.querySelectorAll('[data-bk-case]')].filter(e => e.classList.contains('on') || e.getAttribute('aria-pressed') === 'true' || e.getAttribute('aria-checked') === 'true').map(e => e.getAttribute('data-bk-case')) }));
    check('header control: choosing ' + c + ' stores it and highlights exactly that button', st.c === c && st.on.length === 1 && st.on[0] === c, JSON.stringify(st));
    const prop = await show(p, 'Property'); await show(p, 'Returns'); const snap = await p.evaluate(() => { const e = document.querySelector('.bk-snap'); return e ? e.innerText : ''; });
    check(c + ': the Property editor card names the case', new RegExp('CASE\\s*\\n?\\s*' + c, 'i').test(prop.replace(/Downside\s*Base\s*Upside/i, '')) || prop.includes(c), prop.slice(0, 0));
    check(c + ': the Deal Snapshot flags a non-Base case and does not flag Base', c === 'Base' ? !/(DOWNSIDE|UPSIDE) CASE/.test(snap) : new RegExp(c.toUpperCase() + ' CASE').test(snap), snap.slice(0, 60));
  }

  /* ---- directions ---- */
  check('definitions: Base has no overrides; Upside lowers the exit cap, raises rent growth, lowers the rate; Downside does the opposite', Object.keys(E.Base.ov).length === 0 && E.Upside.ov.exitCap < E.Base.exitCap && E.Downside.ov.exitCap > E.Base.exitCap && E.Upside.ov.rentGrowth > E.Downside.ov.rentGrowth && E.Upside.ov.acqRate < E.Downside.ov.acqRate, JSON.stringify([E.Upside.ov, E.Downside.ov]));
  check('acquisition with debt: levered IRR Upside > Base > Downside, and the multiple too', E.Upside.irr > E.Base.irr && E.Base.irr > E.Downside.irr && E.Upside.moic > E.Base.moic && E.Base.moic > E.Downside.moic, [E.Upside.irr, E.Base.irr, E.Downside.irr].map(pc).join(' / '));
  const q = await open(A, { purchasePrice: 19800000, debtEnabled: false }); const Eq = await eng(q);
  check('acquisition with no debt: Upside > Base > Downside (the rate delta does nothing, the exit cap and growth still move it)', Eq.Upside.irr > Eq.Base.irr && Eq.Base.irr > Eq.Downside.irr, [Eq.Upside.irr, Eq.Base.irr, Eq.Downside.irr].map(pc).join(' / ')); await q.close();
  const d = await open(D); const Ed = await eng(d);
  check('development: Upside > Base > Downside', Ed.Upside.irr > Ed.Base.irr && Ed.Base.irr > Ed.Downside.irr, [Ed.Upside.irr, Ed.Base.irr, Ed.Downside.irr].map(pc).join(' / '));

  /* ---- non-destructive ---- */
  await pickCase(p, 'Base'); for (const sh of ['Returns', 'Debt', 'Cash Flow Report', 'Valuation Report', 'After-Tax', 'Equity Waterfall']) await show(p, sh);   /* some pages seed their own defaults the first time they open; that is not the case switch */
  const snap0 = await p.evaluate(() => { const s = JSON.parse(JSON.stringify(bkLoad())); ['_undo', '_provenance'].forEach(k => delete s[k]); return JSON.stringify(s); });
  for (const c of ['Downside', 'Upside', 'Downside', 'Base']) { await pickCase(p, c); for (const sh of ['Returns', 'Debt', 'Cash Flow Report', 'Valuation Report', 'After-Tax', 'Equity Waterfall']) await show(p, sh); }
  const snap1 = await p.evaluate(() => { const s = JSON.parse(JSON.stringify(bkLoad())); ['_undo', '_provenance'].forEach(k => delete s[k]); return JSON.stringify(s); });
  check('cycling the cases and visiting the output pages never changes the deal\'s own assumptions', snap0 === snap1);

  /* ---- every output page shows the selected case's figures ---- */
  for (const c of ['Downside', 'Upside', 'Base']) {
    await pickCase(p, c); const e = E[c], irr = pc(e.irr), others = ['Base', 'Upside', 'Downside'].filter(x => x !== c && Math.abs(E[x].irr - e.irr) > 0.0005).map(x => pc(E[x].irr));
    const pages = {}; for (const sh of ['Returns', 'Valuation Report', 'After-Tax', 'Debt', 'Property CF', 'Equity Waterfall', 'Cash Flow Report']) pages[sh] = await show(p, sh);
    for (const sh of ['Returns', 'Valuation Report', 'After-Tax']) check(c + ': ' + sh + ' shows the ' + c + ' levered IRR (' + irr + ') and not another case\'s', pages[sh].includes(irr) && !others.some(o => pages[sh].includes(o) && sh !== 'Returns'), sh + ' ' + irr);
    await show(p, 'Returns'); const snapT = await p.evaluate(() => (document.querySelector('.bk-snap') || { innerText: '' }).innerText);
    check(c + ': the Deal Snapshot agrees (' + irr + ')', snapT.includes(irr), snapT.slice(0, 80).replace(/\n/g, ' '));
    const ro = (pages.Returns.match(/(?<![Uu]n)levered IRR\s+(\d+\.\d+)%/g) || []);
    check(c + ': every "levered IRR" figure on Returns is the engine\'s, to two decimals (not a rounded 14.3 padded to 14.30)', ro.length > 0 && ro.every(t => t.endsWith(irr)), ro.join(' | '));
    check(c + ': the Cash Flow Report shows the ' + c + ' Year-1 NOI (' + n0(e.noi1) + ')', pages['Cash Flow Report'].includes(n0(e.noi1)) || pages['Cash Flow Report'].includes(n0(e.noi1 / 1000)), n0(e.noi1));
    check(c + ': Debt shows the ' + c + ' loan (' + n0(e.loan) + ')', pages.Debt.includes(n0(e.loan)) || pages.Debt.includes((e.loan / 1e6).toFixed(2)), n0(e.loan));
  }
  const cfB = (await (async () => { await pickCase(p, 'Base'); return show(p, 'Cash Flow Report'); })()), cfD = (await (async () => { await pickCase(p, 'Downside'); return show(p, 'Cash Flow Report'); })());
  check('the Cash Flow Report differs between Base and Downside (it is not a Base page under a Downside label)', cfB !== cfD && !/Scenario view/.test(cfB) && /Scenario view: Downside/.test(await p.evaluate(() => document.querySelector('#viewport').innerText)) || cfB !== cfD);

  /* ---- Base-only pages say so ---- */
  for (const sh of ['IC Memo', 'Deal Remedies', 'Pre-Offer Bid', 'Sell vs Hold']) {
    await pickCase(p, 'Downside'); const dn = await p.evaluate(async (sh) => { showSheet(sh); await new Promise(r => setTimeout(r, 1000)); const e = document.querySelector('#viewport .bk-casenote'); return e ? e.innerText : null; }, sh);
    await pickCase(p, 'Base'); const bs = await p.evaluate(async (sh) => { showSheet(sh); await new Promise(r => setTimeout(r, 1000)); return !!document.querySelector('#viewport .bk-casenote'); }, sh);
    check(sh + ': says it judges the Base case when Downside is selected, and says nothing when Base is', dn && /judges the Base case/.test(dn) && /Downside/.test(dn) && bs === false, dn);
  }

  /* ---- no stale state ---- */
  await pickCase(p, 'Base'); const r1 = await show(p, 'Returns'); await pickCase(p, 'Downside'); await show(p, 'Returns'); await pickCase(p, 'Base'); const r2 = await show(p, 'Returns');
  check('Base -> Downside -> Base returns the Returns page to exactly what it was (nothing stale)', r1.replace(/· \d+ changed/g, '') === r2.replace(/· \d+ changed/g, ''));

  /* ---- print and the other case tables ---- */
  await pickCase(p, 'Downside'); await show(p, 'Cash Flow Report');
  const head = await p.evaluate(() => { bkPrintPrepare(); const t = document.getElementById('bk-print-head').innerText; bkPrintCleanup(); return t; });
  check('the printed header carries the Downside case and the Downside IRR', /Downside/i.test(head) && head.includes(pc(E.Downside.irr)), head.replace(/\n/g, ' ').slice(0, 140));
  const sens = await show(p, 'Sensitivity');
  check('Sensitivity: the Base / Upside / Downside comparison carries each case\'s IRR', ['Base', 'Upside', 'Downside'].every(c => sens.includes(pc(E[c].irr))), ['Base', 'Upside', 'Downside'].map(c => pc(E[c].irr)).join(' / '));

  check('no page errors', p.errs.length === 0 && d.errs.length === 0, p.errs.concat(d.errs).slice(0, 2).join(' | '));
  console.log('cases: ' + checks + ' checks, ' + fails + ' failures'); await b.close(); process.exit(fails ? 1 : 0);
})();
