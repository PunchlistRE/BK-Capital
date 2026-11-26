// Import OM, 37 Kenyon Street layout (Hartford, CT, 26 pages): the file that froze the app when read through the Import screen. The hub's row reader
// (bkImportPdfRows) backtracked exponentially on its long figure rows; it must now finish in well under a second. The read must name the property
// (not "Apar tments"), count 19 units from the unit-by-unit rent roll (its total row "19 Units" is not a unit), take the $2,275,000 asking price,
// read both statement columns, put the 19 units on the deal, and tie the deal's NOI to the OM's within $5.
// Page text in audit/fixtures/om_kenyon_pages is what the importer's reader returns for the 26 pages.
//   node audit/om_kenyon_test.js index.html
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); const path = require('path'), fs = require('fs');
const pages = []; for (let i = 1; i <= 26; i++) pages.push(fs.readFileSync(path.join(__dirname, 'fixtures', 'om_kenyon_pages', 'kenyon_p' + i + '.txt'), 'utf8'));
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const p = await b.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route(/supabase\.co|vercel\.app|fonts\.g|cdn\.jsdelivr/, r => r.abort());
  await p.goto('file://' + path.resolve(process.argv[2])); await p.waitForTimeout(700);
  await p.evaluate(() => document.documentElement.classList.add('bk-auth-ok'));
  let checks = 0, fails = 0; const check = (n, ok, d) => { checks++; if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? '  [' + String(d).slice(0, 300) + ']' : '')); };
  const hub = await p.evaluate(pg => { const t0 = performance.now(); let n = 0; pg.forEach(x => { const r = window.bkImportPdfRows(x); n += (r && r.length) || 0; }); return { ms: Math.round(performance.now() - t0), rows: n }; }, pages);
  check('the Import screen\'s row reader gets through all 26 pages quickly (it froze the browser on this file before): ' + hub.ms + ' ms', hub.ms < 1000 && hub.rows > 0, JSON.stringify(hub));
  const r = await p.evaluate(pg => { bkCreateNewDeal({ name: 'x', dealId: 'X' }); const o = bkOMParse(pg), S = bkOMState(); S.om = o; S.basis = 'cur'; S.dec = {}; S.ov = {}; S.mPrice = null;
    const bd = bkOMBuild(o, 'cur', 'kenyon.pdf'), I = o.ie || {};
    return { name: o.name, city: o.city, state: o.state, units: o.units, price: o.price, cands: (o.priceCandidates || []).map(c => c.kind + ':' + c.value), roll: o.unitRoll ? o.unitRoll.rows.length : 0, rollIds: o.unitRoll ? o.unitRoll.rows.map(u => String(u.unit || u.unitId || '')) : [],
      periods: I.periods, noi: I.noi, tie: bd.tie, want: bd.want, deal: { name: bd.deal.name, units: bd.deal.units, price: bd.deal.purchasePrice, rr: (bd.deal.rentRoll || []).length } }; }, pages);
  check('identity: Kenyon Street Apartments, Hartford, CT (the name was read as "Apar tments" before)', r.name === 'Kenyon Street Apartments' && r.city === 'Hartford' && r.state === 'CT', JSON.stringify([r.name, r.city, r.state]));
  check('19 units, from the unit-by-unit rent roll; its "19 Units" total row is not a unit (9 were read before)', r.units === 19 && r.roll === 19 && r.rollIds.indexOf('19 Units') < 0, JSON.stringify([r.units, r.roll]));
  check('the asking price: $2,275,000, and every price candidate on the OM agrees', r.price === 2275000 && r.cands.length > 0 && r.cands.every(c => c === 'asking:2275000'), JSON.stringify(r.cands));
  check('both statement columns are read: NOI $159,847 current and $180,804 pro forma', JSON.stringify(r.periods) === '["cur","pf"]' && r.noi && r.noi.cur === 159847 && r.noi.pf === 180804, JSON.stringify([r.periods, r.noi]));
  check('the deal carries the OM: its name, 19 units, the $2,275,000 price and all 19 units on its rent roll', r.deal.name === 'Kenyon Street Apartments' && r.deal.units === 19 && r.deal.price === 2275000 && r.deal.rr === 19, JSON.stringify(r.deal));
  check('the deal\'s NOI ties to the OM\'s current NOI within $5', r.tie != null && Math.abs(r.tie - 159847) <= 5 && r.want === 159847, JSON.stringify([r.tie, r.want]));
  check('no page errors', errs.length === 0, errs.join(' | '));
  console.log('om kenyon: ' + checks + ' checks, ' + fails + ' failures'); await b.close(); process.exit(fails ? 1 : 0);
})();
