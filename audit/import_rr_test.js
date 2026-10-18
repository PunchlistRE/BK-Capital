// Import Rent Roll: reads synthetic Yardi-style rent rolls (CSV, XLSX, and a PDF printed from the same data) and checks every unit, the
// summary, the deal's revenue and the apply / replace / add behaviour against audit/fixtures/rent_roll_expected.json (made by make_rent_roll.py).
//   node audit/import_rr_test.js index.html
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const path = require('path'), fs = require('fs');
const FX = path.join(__dirname, 'fixtures'), EXP = JSON.parse(fs.readFileSync(path.join(FX, 'rent_roll_expected.json'), 'utf8'));
const A = require(path.join(__dirname, 'deal.js'));
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined }); const p = await b.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message)); await p.route(/supabase\.co|vercel\.app|fonts\.g/, r => r.abort());
  await p.goto('file://' + path.resolve(process.argv[2])); await p.waitForTimeout(800);
  let checks = 0, fails = 0; const check = (n, ok, d) => { checks++; if (!ok) { fails++; console.log('FAIL ' + n + (d ? '  ' + d : '')); } };
  await p.evaluate(a => { document.documentElement.classList.add('bk-auth-ok'); bkCreateNewDeal(a); showSheet('Import Rent Roll'); }, A); await p.waitForTimeout(300);
  check('Import Rent Roll renders an upload control', await p.evaluate(() => !!document.getElementById('bkRRFile')));
  // a PDF printed from the same data (ordinary text layer)
  const rows = EXP.units, hdr = ['Unit', 'Unit Type', 'Unit Sq Ft', 'Resident', 'Market Rent', 'Lease Rent', 'Lease From', 'Lease To', 'Status'];
  const csvRows = fs.readFileSync(path.join(FX, 'rent_roll_yardi.csv'), 'utf8').split('\n').slice(4).filter(l => l && !/^Total/.test(l)).map(l => l.split(','));
  const html = '<html><body style="font:10px Helvetica"><h3>RENT ROLL - TESTVILLE APARTMENTS (synthetic)</h3><table cellspacing="0" cellpadding="2"><tr>' + hdr.map(h => `<th align="left">${h}</th>`).join('') + '</tr>'
    + csvRows.map(r => '<tr>' + r.map(c => `<td>${c}</td>`).join('') + '</tr>').join('') + '</table></body></html>';
  const pg = await b.newPage(); await pg.setContent(html); const pdfBuf = await pg.pdf({ format: 'Letter' }); await pg.close();
  const sources = [['CSV', fs.readFileSync(path.join(FX, 'rent_roll_yardi.csv')), 'rr.csv'], ['XLSX', fs.readFileSync(path.join(FX, 'rent_roll_yardi.xlsx')), 'rr.xlsx'], ['PDF', pdfBuf, 'rr.pdf']];
  for (const [label, buf, name] of sources) {
    const R = await p.evaluate(async ([b64, nm]) => { const u8 = Uint8Array.from(atob(b64), c => c.charCodeAt(0)); const parsed = await bkImportParseFile(new File([u8], nm));
      const sh = bkRRSheets(parsed).filter(s => s.rows.length > 5)[0]; if (!sh) return { none: true, unreadable: !!parsed.unreadable }; const r = bkRRParse(sh.rows, { fromPdf: parsed.kind === 'pdf' });
      return r && { head: r.head, map: r.map, units: r.units, stats: r.stats, recon: r.recon, warnings: r.warnings }; }, [Buffer.from(buf).toString('base64'), name]);
    check(label + ': a rent roll is found', R && R.head >= 0, JSON.stringify(R && R.none));
    if (!R || !(R.head >= 0)) continue;
    check(label + ': ' + EXP.units.length + ' units read', R.units.length === EXP.units.length, String(R.units.length));
    const bad = [];
    EXP.units.forEach((e, i) => { const u = R.units[i]; if (!u) { bad.push('missing ' + e.unitId); return; }
      for (const k of ['unitId', 'sf', 'tenantType', 'status', 'inPlaceRent', 'marketRent']) if (String(u[k]) !== String(e[k])) bad.push(`${e.unitId}.${k}: ${u[k]} vs ${e[k]}`);
      if (label !== 'PDF') for (const k of ['leaseStart', 'leaseEnd']) if (u[k] !== e[k]) bad.push(`${e.unitId}.${k}: ${u[k]} vs ${e[k]}`); });
    check(label + ': every unit field matches the truth', bad.length === 0, bad.slice(0, 4).join(' | '));
    for (const k of Object.keys(EXP.stats)) check(label + ': ' + k, Math.abs((R.stats[k] || 0) - EXP.stats[k]) < 0.01, `${R.stats[k]} vs ${EXP.stats[k]}`);
    if (label !== 'PDF') check(label + ': ties to the report\'s own total row', R.recon && R.recon.sfOk === true && R.recon.rentOk === true, JSON.stringify(R.recon));
  }
  // through the sheet: upload, apply, and the deal's revenue uses the imported rent roll
  await p.setInputFiles('#bkRRFile', path.join(FX, 'rent_roll_yardi.xlsx')); await p.waitForTimeout(1500);
  check('the sheet shows the column mapping and a preview', await p.evaluate(() => { const c = [...document.querySelectorAll('#viewport caption')].map(x => x.textContent); return c.includes('Column Mapping') && c.some(x => /^Preview/.test(x)); }));
  await p.click('button:has-text("ADD THESE")'); await p.waitForTimeout(500);
  const after = await p.evaluate(() => { const s = bkLoad(); return { n: s.rentRoll.length, units: s.units, basis: s.revenueBasis, sheet: currentSheet, gpr: bkCalc().gpr, st: bkRentRollStats(s.rentRoll), first: s.rentRoll[0] }; });
  check('apply writes the rent roll and opens the Rent Roll sheet', after.n === EXP.units.length && after.sheet === 'Rent Roll' && after.basis === 'RENT ROLL', JSON.stringify([after.n, after.sheet, after.basis]));
  check('the deal\'s Units follow the residential count', after.units === EXP.stats.resUnits, String(after.units));
  check("the operating statement's gross potential rent = imported residential in-place x 12", Math.abs(after.gpr - EXP.stats.resInPlace * 12) < 0.01, `${after.gpr} vs ${EXP.stats.resInPlace * 12}`);
  check('imported rows carry the app\'s rent-roll fields', after.first && ['unitId', 'sf', 'tenantType', 'status', 'inPlaceRent', 'marketRent', 'recovery', 'leaseStart', 'leaseEnd'].every(k => k in after.first));
  // replace vs add
  await p.evaluate(() => showSheet('Import Rent Roll')); await p.setInputFiles('#bkRRFile', path.join(FX, 'rent_roll_yardi.csv')); await p.waitForTimeout(1500);
  check('with an existing rent roll the buttons say how many units are replaced', await p.evaluate(() => /REPLACE THE EXISTING 26 UNITS/.test(document.querySelector('#viewport').innerText)));
  await p.click('button:has-text("ADD TO THE EXISTING")'); await p.waitForTimeout(400);
  check('"add" appends to the existing rent roll', await p.evaluate(() => bkLoad().rentRoll.length) === EXP.units.length * 2);
  await p.evaluate(() => showSheet('Import Rent Roll')); await p.setInputFiles('#bkRRFile', path.join(FX, 'rent_roll_yardi.csv')); await p.waitForTimeout(1500);
  await p.click('button:has-text("REPLACE THE EXISTING")'); await p.waitForTimeout(400);
  check('"replace" leaves exactly the imported units', await p.evaluate(() => bkLoad().rentRoll.length) === EXP.units.length);
  // mapping controls: annual rents and a forced type
  const ann = await p.evaluate(() => { const rows = [['Unit', 'Sq Ft', 'Annual Rent', 'Market Rent (annual)', 'Tenant'], ['A1', 500, 12000, 14400, 'x'], ['A2', 600, 0, 15600, '']]; const r = bkRRParse(rows, { basis: 'annual' }); return r && r.units.map(u => [u.inPlaceRent, u.marketRent, u.status]); });
  check('annual rent amounts are converted to monthly and a blank tenant is vacant', JSON.stringify(ann) === JSON.stringify([[1000, 1200, 'Occupied'], [0, 1300, 'Vacant']]), JSON.stringify(ann));
  const none = await p.evaluate(() => bkRRParse([['foo', 'bar'], [1, 2]]));
  check('a file with no rent-roll header is refused', none === null);
  check('no page errors', errs.length === 0, errs.join(' | '));
  await b.close(); console.log(`${checks} checks, ${fails} failures`); process.exit(fails ? 1 : 0);
})();
