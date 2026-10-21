// Import Deal: extracts the Yardi T-12 line items from a workbook and from a PDF print of it, and compares every deal with the
// independent build (audit/real/build_real_deals.py -> real_deals.json). The source files are the user's own data and are not in the repo:
//   BK_YARDI_XLSM=/path/Yardi_Portfolio_Master...xlsm  BK_SHOREPOINTE_PDF=/path/ShorePointe...pdf  node audit/import_test.js index.html
// Without them only the synthetic checks run.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const path = require('path'), fs = require('fs');
const REAL = require(path.join(__dirname, 'real', 'real_deals.json'));
const A = require(path.join(__dirname, 'deal.js'));
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined }); const p = await b.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message)); await p.route(/supabase\.co|vercel\.app|fonts\.g/, r => r.abort());
  await p.goto('file://' + path.resolve(process.argv[2])); await p.waitForTimeout(800);
  let checks = 0, fails = 0; const check = (n, ok, d) => { checks++; if (!ok) { fails++; console.log('FAIL ' + n + (d ? '  ' + d : '')); } };
  await p.evaluate(a => { document.documentElement.classList.add('bk-auth-ok'); bkCreateNewDeal(a); showSheet('Import Deal'); }, A); await p.waitForTimeout(300);
  check('Import Deal sheet renders with an upload control', await p.evaluate(() => !!document.getElementById('bkImportFile')));
  // synthetic: a small CSV in the Yardi layout, with a scan error the section total exposes
  const csv = ['TESTVILLE - YARDI SOURCE BENCHMARK,,,,', 'Type,Residential,,,', 'Units,10,,,', 'SF,9000,,,', 'Cap Rate,5.5%,,,', ',,,,', 'Section,Yardi Line Item,Jan,Feb,Reported Total,Source',
    'Residential Rent Income,Rent - Residential,5000,5000,10000,x', 'Residential Rent Income,Parking,100,100,200,x', 'Residential Rent Income,TOTAL RESIDENTIAL RENT,5100,5100,10200,x',
    'Other Property Income,Late Fee,50,50,100,x', 'Other Property Income,TOTAL OTHER PROPERTY INCOME,50,50,100,x',
    'Property Expenses,Property Taxes,1000,1000,2000,x', 'Property Expenses,Repairs,100,100,200,x', 'Property Expenses,TOTAL PROPERTY EXPENSES,1100,1100,2200,x',
    'Office Expenses,Insurance,200,200,400,x', 'Office Expenses,TOTAL OFFICE EXPENSES,200,200,400,x', 'Operating Income,NET INCOME,0,0,7700,x'].join('\n');
  const syn = await p.evaluate(async c => { const f = new File([c], 'testville.csv', { type: 'text/csv' }); const parsed = await bkImportParseFile(f); const ps = bkImportExtract(parsed); return ps.map(x => ({ name: x.name, noi: x.noi, units: x.units, cap: x.cap, tied: x.tied, items: x.items })); }, csv);
  check('CSV: one property extracted', syn.length === 1, JSON.stringify(syn));
  if (syn.length) { check('CSV: NOI = income 10,300 less opex 2,600', Math.abs(syn[0].noi - 7700) < 0.01, String(syn[0].noi)); check('CSV: units, cap rate read from the facts block', syn[0].units === 10 && Math.abs(syn[0].cap - 0.055) < 1e-9);
    check('CSV: ties to the statement NET INCOME', syn[0].tied === true); }
  const X = process.env.BK_YARDI_XLSM, PDF = process.env.BK_SHOREPOINTE_PDF;
  const same = (a, bv, tol) => Math.abs(a - bv) <= tol;
  if (X && fs.existsSync(X)) {
    await p.setInputFiles('#bkImportFile', X); await p.waitForTimeout(6000);
    check('uploading the workbook through the sheet lists its properties', await p.evaluate(() => [...document.querySelectorAll('#viewport caption')].some(c => /Properties Extracted/.test(c.textContent))));
    await p.screenshot({ path: process.env.BK_SHOT || '/tmp/import.png' });
    await p.click('#viewport tr:has-text("ShorePointe") button:has-text("CREATE DEAL")'); await p.waitForTimeout(600);
    const made = await p.evaluate(() => { const s = bkLoad(); return { name: s.name, price: s.purchasePrice, units: s.units, noi: bkCalc().noi, sheet: currentSheet }; });
    check('CREATE DEAL builds the deal and opens the Home dashboard', made.name === 'ShorePointe' && made.sheet === 'Home' && made.price === 13664840, JSON.stringify(made));
    check("the created deal's statement NOI equals the T-12 line-item NOI", Math.abs(made.noi - 683241.98) < 1, String(made.noi));
    const props = await p.evaluate(async (b64) => { const u8 = Uint8Array.from(atob(b64), c => c.charCodeAt(0)); const f = new File([u8], 'Yardi.xlsm'); const parsed = await bkImportParseFile(f);
      return bkImportExtract(parsed).map(x => ({ name: x.name, type: x.type, noi: x.noi, units: x.units, sf: x.sf, cap: x.cap, gap: x.gap, tied: x.tied, deal: x.cap ? bkImportDeal(x, x.cap, x.units) : null, flags: x.flags })); }, fs.readFileSync(X).toString('base64'));
    for (const r of REAL) {
      const e = props.find(q => q.name === r.property); check(r.property + ': found in the workbook', !!e); if (!e) continue; const d = e.deal, t = r.deal;
      check(r.property + ': NOI', same(e.noi, r.targets.t12noi, 0.01), `${e.noi} vs ${r.targets.t12noi}`);
      check(r.property + ': purchase price = NOI / cap', d.purchasePrice === t.purchasePrice, `${d.purchasePrice} vs ${t.purchasePrice}`);
      for (const k of ['units', 'gsf', 'taxes', 'insurance', 'utilities', 'rm', 'payroll', 'turnover', 'marketing', 'ga']) check(r.property + ': ' + k, same(d[k], t[k], 0.01), `${d[k]} vs ${t[k]}`);
      for (const k of ['avgRent', 'otherIncomePerUnit', 'mgmtPct']) check(r.property + ': ' + k, same(d[k], t[k], 1e-6), `${d[k]} vs ${t[k]}`);
      check(r.property + ': extraction notes match the independent build in number', e.flags.length === r.flags.length, `${e.flags.length} vs ${r.flags.length}`);
      check(r.property + ': gap to the statement NET INCOME equals the independent build', same(e.gap, r.targets.gapToStatement, 0.01), `${e.gap} vs ${r.targets.gapToStatement}`);
      check(r.property + ': ties to the statement within 0.25%', e.tied === true, String(e.gap));
    }
    check('the workbook\'s non-residential tabs are listed but not offered as multifamily deals', props.some(q => /harvard|selleck|seaview/i.test(q.name)) ? props.filter(q => /harvard|selleck|seaview/i.test(q.name)).every(q => !/resid|multi/i.test(q.type)) : true);
  } else console.log('SKIPPED workbook checks (set BK_YARDI_XLSM)');
  if (PDF && fs.existsSync(PDF)) {
    const r = await p.evaluate(async (b64) => { const bin = atob(b64), u8 = Uint8Array.from(bin, c => c.charCodeAt(0)); const f = new File([u8], 'ShorePointe.pdf', { type: 'application/pdf' });
      const parsed = await bkImportParseFile(f); if (parsed.unreadable) return { unreadable: true }; const ps = bkImportExtract(parsed); return { n: ps.length, p: ps[0] && { name: ps[0].name, noi: ps[0].noi, units: ps[0].units, sf: ps[0].sf, cap: ps[0].cap, tied: ps[0].tied, items: ps[0].items } }; }, fs.readFileSync(PDF).toString('base64'));
    const s = REAL.find(q => q.property === 'ShorePointe');
    check('PDF: text is readable', !r.unreadable); if (!r.unreadable) { check('PDF: one property extracted', r.n === 1);
      if (r.p) { check('PDF: NOI equals the workbook build', same(r.p.noi, s.targets.t12noi, 0.01), `${r.p.noi} vs ${s.targets.t12noi}`); check('PDF: units, SF and cap rate read', r.p.units === 38 && r.p.sf === 30482 && same(r.p.cap, 0.05, 1e-9), JSON.stringify(r.p));
        check('PDF: ties to the statement', r.p.tied === true); } }
  } else console.log('SKIPPED PDF checks (set BK_SHOREPOINTE_PDF)');
  check('no page errors', errs.length === 0, errs.join(' | '));
  await b.close(); console.log(`${checks} checks, ${fails} failures`); process.exit(fails ? 1 : 0);
})();
