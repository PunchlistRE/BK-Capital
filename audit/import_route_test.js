// Import tab routing: an offering memorandum that carries a rent roll or unit mix page is still read as an OM; a plain rent roll is still a rent roll.
// Regression for 32 Ferry Street: the unit-mix heading "Unit Type | # of Units | Current" was taken for a rent-roll header ("Current" contains "rent").
//   node audit/import_route_test.js index.html
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); const path = require('path'); const fs = require('fs');
const dir = path.join(__dirname, 'fixtures', 'om_ferry_pages'), ferry = fs.readdirSync(dir).sort().map(f => fs.readFileSync(path.join(dir, f), 'utf8'));
const RR = ['Rent Roll as of 10/1/2026', 'Unit   Tenant   Sq Ft   Lease From   Lease To   Lease Rent   Market Rent', ...Array.from({ length: 9 }, (_, i) => `${101 + i}   Tenant ${i + 1}   750   1/1/2026   12/31/2026   $1,${400 + i * 10}   $1,500`), 'Total   6,750   $12,960   $13,500'].join('\n');
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined }); const p = await b.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route(/supabase\.co|vercel\.app|fonts\.g|cdn\.jsdelivr/, r => r.abort()); await p.goto('file://' + path.resolve(process.argv[2])); await p.waitForTimeout(700);
  let checks = 0, fails = 0; const check = (n, ok, d) => { checks++; if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? '  [' + String(d).slice(0, 300) + ']' : '')); };
  const cls = (pages) => p.evaluate((pg) => bkImportClassify({ kind: 'pdf', sheets: pg.map((t, i) => ({ name: 'page ' + (i + 1), rows: bkImportPdfRows(t) })) }), pages);
  const a = await cls(ferry);
  check('32 Ferry Street (OM pages: listing price, unit mix, commercial rent roll, income summary) is read as an offering memorandum, not a rent roll', a.listing && !a.rentRoll && /offering memorandum/.test(a.kind), JSON.stringify(a));
  const unitMixOnly = await cls([ferry.find(t => /Unit Type/.test(t))]);
  check('a unit-mix page whose columns say "Current" is not taken for a rent-roll header', !unitMixOnly.rentRoll, JSON.stringify(unitMixOnly));
  const rr = await cls([RR]);
  check('a plain rent roll PDF (Unit, Tenant, Lease Rent, Market Rent) is still a rent roll', rr.rentRoll && !rr.listing && rr.kind === 'rent roll', JSON.stringify(rr));
  const rrx = await p.evaluate((t) => bkImportClassify({ kind: 'xlsx', sheets: [{ name: 'RR', rows: t.split('\n').map(l => l.split(/\s{3,}/)) }] }), RR);
  check('the same rent roll as a spreadsheet is a rent roll', rrx.rentRoll, JSON.stringify(rrx));
  check('no page errors', errs.length === 0, errs.join(' | '));
  console.log(checks + ' checks, ' + fails + ' failures'); await b.close(); process.exit(fails ? 1 : 0);
})();
