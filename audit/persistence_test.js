// Persistence test for the GP / LP equity split and the convention fields.
// For each GP value and entry path: save in one browser, round-trip the deal through the same mappers
// the Supabase save/restore uses (bkMap.stateToInputData -> reconstructState), reopen it in a FRESH
// browser whose code defaults have been changed, and confirm the saved value - not a default - comes back.
//   node audit/persistence_test.js index.html
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const path = require('path');
const A = require(path.join(__dirname, 'deal.js'));
const FILE = 'file://' + path.resolve(process.argv[2]);
const CASES = [
  { gp: 0.10, via: 'created' }, { gp: 0.50, via: 'created' }, { gp: 0.075, via: 'created' },
  { gp: 0.10, via: 'typed' },   { gp: 0.50, via: 'typed' },   { gp: 0.075, via: 'typed' },
  { gp: null, via: 'template default' }
];
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  let fails = 0;
  const open = async () => { const ctx = await b.newContext(); const p = await ctx.newPage(); const errs = [];
    p.on('pageerror', e => errs.push(e.message)); await p.route(/supabase\.co|vercel\.app|fonts\.g/, r => r.abort());
    await p.goto(FILE); await p.waitForTimeout(900); return { ctx, p, errs }; };
  for (const c of CASES) {
    // ---- session 1: create, enter, save
    const s1 = await open();
    await s1.p.evaluate(([deal, c]) => { document.documentElement.classList.add('bk-auth-ok');
      bkCreateNewDeal(c.via === 'created' && c.gp !== null ? Object.assign({}, deal, { gpShare: c.gp }) : deal); showSheet('Deal Underwrite'); }, [A, c]);
    if (c.via === 'typed') {
      const cell = '#viewport tr[data-bk-key="gpShare"] td.v';
      await s1.p.click(cell); await s1.p.keyboard.type(String(+(c.gp * 100).toFixed(4))); await s1.p.keyboard.press('Enter'); await s1.p.waitForTimeout(250);
    }
    const saved = await s1.p.evaluate(() => {
      const raw = JSON.parse(localStorage.getItem('bkcapital.cre.v02'));
      return { raw, inputData: bkMap.stateToInputData(raw), dealRow: bkMap.stateToDealRow(raw), gpNow: bkLoad().gpShare };
    });
    await s1.ctx.close();
    // ---- session 2: fresh browser, CHANGED code defaults, restore through the cloud mapper
    const s2 = await open();
    const r = await s2.p.evaluate((saved) => {
      document.documentElement.classList.add('bk-auth-ok');
      window.BK_TEMPLATE_OVERRIDES = { gpShare: 0.20 }; BK_BASE.gpShare = 0.30;     // simulate future default changes
      const st = bkMap.reconstructState(saved.dealRow, { input_data: saved.inputData, source_data: {} }, []);
      window.bkProvision('cloud-load', st);
      showSheet('Deal Underwrite');
      const s = bkLoad(), w = bkWaterfallV07(), cv = bkConventions(s);
      const cell = document.querySelector('#viewport tr[data-bk-key="gpShare"] td.v');
      return { gp: s.gpShare, lpShareOfContrib: w.lp.contrib / (w.lp.contrib + w.gp.contrib), shown: cell ? cell.textContent.trim() : null,
               lpRow: [...document.querySelectorAll('#viewport tr')].find(t => /LP Equity Share/.test(t.textContent))?.cells[1].textContent.trim(),
               conv: [cv.cvRentGrowthStart, cv.cvOpexVariablePct, cv.cvLtvBasis, cv.cvHurdleBasis].join('/'), stored: Object.prototype.hasOwnProperty.call(saved.raw, 'gpShare') };
    }, saved);
    const want = c.gp === null ? 0.10 : c.gp;
    const ok = Math.abs(r.gp - want) < 1e-12 && Math.abs(r.lpShareOfContrib - (1 - want)) < 1e-9 && s2.errs.length === 0 && r.conv === 'year2/0/price/lp';
    if (!ok) fails++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  GP ${c.gp === null ? 'default' : (c.gp * 100) + '%'} (${c.via}): saved ${saved.gpNow} -> reopened ${r.gp} | shown "${r.shown}" LP "${r.lpRow}" | LP share of contributions ${(r.lpShareOfContrib * 100).toFixed(2)}% | conventions ${r.conv} | value in stored record: ${r.stored}`);
    await s2.ctx.close();
  }
  // ---- a legacy deal (template v1, no convention fields) keeps its methodology and its 50% GP
  const s3 = await open();
  const lg = await s3.p.evaluate((deal) => {
    bkCreateNewDeal(deal);
    const st = JSON.parse(localStorage.getItem('bkcapital.cre.v02'));
    ['cvRentGrowthStart','cvOpexVariablePct','cvLtvBasis','cvHurdleBasis','cvBadDebtBasis','_conventions','gpShare'].forEach(k => delete st[k]);
    st._template = Object.assign({}, st._template, { name: 'Institutional Standard v1' }); st._template.values.gpShare = 0.5;
    const restored = bkMap.reconstructState(bkMap.stateToDealRow(st), { input_data: bkMap.stateToInputData(st), source_data: {} }, []);
    window.bkProvision('cloud-load', restored);
    const cv = bkConventions(bkLoad());
    return { gp: bkLoad().gpShare, legacy: cv.isLegacy, conv: [cv.cvRentGrowthStart, cv.cvOpexVariablePct, cv.cvLtvBasis, cv.cvHurdleBasis, cv.cvBadDebtBasis].join('/') };
  }, A);
  const lok = lg.gp === 0.5 && lg.legacy && lg.conv === 'month1/0.4/value/deal/legacy';
  if (!lok) fails++;
  console.log(`${lok ? 'PASS' : 'FAIL'}  legacy deal reopened: GP ${lg.gp}, conventions ${lg.conv} (legacy=${lg.legacy})`);
  await s3.ctx.close(); await b.close();
  console.log(fails ? fails + ' FAILED' : 'ALL PASSED'); process.exit(fails ? 1 : 0);
})();
