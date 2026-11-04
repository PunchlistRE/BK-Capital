// Spreadsheet ingestion: formulas vs displayed values, merged cells, subtotals, different rent-roll column names and layouts, multi-sheet workbooks, CSV, property lists.
// Inputs are SYNTHETIC (audit/fixtures/make_sheets.py): they prove the rules, they are NOT real-world platform validation. The one REAL workbook (set BK_REAL_STATE_XLSX) is checked in addition.
// A readable file is not a correctly mapped one: every check compares the mapped figures with the known figures in the file.
//   node audit/sheet_ingest_test.js index.html
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); const path = require('path'), fs = require('fs');
const F = n => path.join(__dirname, 'fixtures', 'sheets', n);
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined }); let checks = 0, fails = 0;
  const check = (n, ok, d) => { checks++; if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? '  [' + String(d).slice(0, 320) + ']' : '')); };
  const p = await b.newPage({ viewport: { width: 1300, height: 900 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route(/supabase\.co|vercel\.app|fonts\.g|cdn\.jsdelivr/, r => r.abort()); await p.goto('file://' + path.resolve(process.argv[2])); await p.waitForTimeout(700);
  await p.evaluate(() => { document.documentElement.classList.add('bk-auth-ok'); bkCreateNewDeal({ name: 'x', dealId: 'X' }); });
  const om = async (file) => { await p.evaluate(() => { bkCreateNewDeal({ name: 'x', dealId: 'X' }); showSheet('Import OM'); }); await p.waitForTimeout(250); await p.setInputFiles('#bkOMFile', file);
    await p.waitForFunction(() => /✓ Read |could not find|Could not|no readable|states no income/i.test(document.querySelector('#viewport').innerText), null, { timeout: 60000 }); await p.waitForTimeout(500);
    return p.evaluate(() => { const S = bkOMState(), o = S.om || {}, I = o.ie || {}; let b = null; try { if (I.noi) b = bkOMBuild(o, 'cur', 'x'); } catch (e) {} return { msg: document.querySelector('#viewport').innerText.match(/(✓ Read[^\n]*|⚠[^\n]*)/)[0].slice(0, 200), layout: o.layout || null, price: o.price, units: o.units, noi: I.noi && I.noi.cur, egi: I.egi && I.egi.cur, gsr: I.gsr && I.gsr.cur, expTot: I.expTot && I.expTot.cur, exp: (I.exp || []).map(e => [e.label, e.cur]), listOnly: !!S.listingOnly, list: o.listRows && o.listRows.map(r => [r.name, r.price, r.sizeLow, r.units, r.capPrinted, r.type, r.state, r.city]), notes: b && b.notes.join(' | '), tie: b && b.tie, want: b && b.want, xc: o.crossChecks }; }); };
  const rr = async (file) => { await p.evaluate(() => { bkCreateNewDeal({ name: 'x', dealId: 'X' }); showSheet('Import Rent Roll'); }); await p.waitForTimeout(250); await p.setInputFiles('#bkRRFile', file); await p.waitForTimeout(1500);
    return p.evaluate(() => { const t = document.querySelector('#viewport').innerText; const g = re => { const m = t.match(re); return m ? m[1] : null; }; return { read: /✓ Read/.test(t), noHeader: /No rent-roll header/.test(t), units: +g(/Units \/ suites\s+(\d+)/), inplace: g(/In-place rent[^\n]*?\t\$([\d,]+)/), occupied: g(/Occupied\s+(\d+) of/), warn: t.split('\n').filter(l => /subtotal|ignored|difference|no square|occupied with no rent/i.test(l)).join(' | '), rows: g(/Read (\d+) rows/) }; }); };

  /* formulas vs displayed values */
  { const r = await om(F('syn_statement_formulas.xlsx'));
    check('SYNTHETIC formulas with their displayed (cached) values, on the 2nd sheet after a cover sheet, with a merged title: the DISPLAYED figures are read (NOI $230,000, total expenses $150,000, EGI $380,000), not the formula text and not zero', r.noi === 230000 && r.expTot === 150000 && r.egi === 380000 && r.exp.length === 4 && r.price === 4000000, JSON.stringify([r.noi, r.expTot, r.egi, r.price, r.msg]));
    check('SYNTHETIC: the four expense lines are read with their own amounts, the vacancy line ($20,000) is not read as an expense, and the deal recomputes to the displayed NOI', r.exp.map(e => e[1]).join() === '60000,20000,30000,40000' && r.tie != null && Math.abs(r.tie - 230000) <= 5, JSON.stringify([r.exp, r.tie, r.want])); }
  { const r = await om(F('syn_statement_formulas_uncached.xlsx'));
    check('SYNTHETIC formulas saved WITHOUT cached values (the displayed figures are not in the file): the importer does not invent them: no NOI of $0 or $230,000 is accepted, and the price is still read', !(r.noi > 0) && r.price === 4000000, JSON.stringify([r.noi, r.expTot, r.msg]));
    check('SYNTHETIC: it falls back to the facts it can read and says income is not stated (no statement), rather than failing silently or filling zeros', r.listOnly === true || /could not find/i.test(r.msg), r.msg); }

  /* rent rolls: different names and layouts */
  const want = { a: [6, '9,300'], b: [6, '9,300'], c: [6, '9,300'] };
  { const r = await rr(F('syn_rr_a.xlsx'));
    check('SYNTHETIC rent roll "Apt # / Resident / Sq. Ft. / Monthly Rent" under a merged title row: header found, 6 units, 5 occupied, in-place rent $9,300 a month', r.read && r.units === 6 && r.inplace === '9,300' && r.occupied === '5', JSON.stringify(r)); }
  { const r = await rr(F('syn_rr_b.xlsx'));
    check('SYNTHETIC rent roll with a Building column (unit numbers 1 to 3 repeat in two buildings) and unlabelled subtotals: 6 units (none dropped as "repeated"), $9,300, both subtotals tie', r.read && r.units === 6 && r.inplace === '9,300' && /2 printed subtotals tie/.test(r.warn) && !/ignored/.test(r.warn), JSON.stringify(r)); }
  { const r = await rr(F('syn_rr_c.xlsx'));
    check('SYNTHETIC: a printed subtotal ($6,000) that does not equal its rows ($6,400) is reported with the difference and NOT adjusted (the units still load as listed)', r.units === 6 && r.inplace === '9,300' && /subtotal of \$6,000/.test(r.warn) && /\$400/.test(r.warn) && /NOT adjusted/.test(r.warn), JSON.stringify(r)); }
  { const r = await rr(F('syn_rr_d.xlsx'));
    check('SYNTHETIC commercial rent roll "Suite / Tenant / RSF / Annual Rent": 3 suites, 2 occupied, annual rents converted to monthly ($7,500 a month)', r.read && r.units === 3 && r.occupied === '2' && r.inplace === '7,500', JSON.stringify(r)); }
  { const r = await rr(F('syn_rr_e.csv'));
    check('SYNTHETIC CSV with a byte-order mark, quoted commas ("Smith, John") and "1,450" as text: 3 units, 2 occupied, $2,950, the Total row is not a unit', r.read && r.units === 3 && r.occupied === '2' && r.inplace === '2,950', JSON.stringify(r)); }

  /* multi-sheet package: statement + rent roll, they must agree */
  { const r = await om(F('syn_package.xlsx'));
    check('SYNTHETIC multi-sheet package (summary, underwriting, rent roll): the statement is found on the 2nd sheet (NOI $83,600), and the unit count (6) comes from the rent roll sheet, flagged for confirmation', r.noi === 83600 && r.units === 6 && /number of rows in the rent roll on sheet "RentRoll"/.test(r.notes || ''), JSON.stringify([r.noi, r.units]));
    check('SYNTHETIC: the rent roll ($111,600 a year) is set beside the statement\'s gross income ($111,600) and ties', r.xc && r.xc[0] && r.xc[0].ok === true && r.xc[0].rentRollAnnual === 111600, JSON.stringify(r.xc)); }

  /* property list */
  { const r = await om(F('syn_property_list.xlsx'));
    check('SYNTHETIC spreadsheet property list: read as 3 properties (the TOTAL row is not one), prices, sizes, units, cap rates and types per row; "Call for price" is not a number', r.layout === 'list' && r.list.length === 3 && r.list[0][0] === '10 Main St' && r.list[0][1] === 1500000 && r.list[0][3] === 8 && Math.abs(r.list[0][4] - 0.065) < 1e-9 && r.list[1][1] === null && r.list[2][5] === 'Mixed Use', JSON.stringify(r.list)); }

  /* the REAL workbook */
  const RS = process.env.BK_REAL_STATE_XLSX;
  if (RS && fs.existsSync(RS)) {
    const r = await om(RS), q = await rr(RS);
    check('REAL owner workbook (1435 and 1455 State St): statement NOI $346,211.48 and 6 expense lines tie; price $9.8M; 38 units from the rent roll sheet (units flagged for confirmation)', Math.abs(r.noi - 346211.48) < 0.01 && r.exp.length === 6 && r.price === 9800000 && r.units === 38 && /number of rows in the rent roll/.test(r.notes || ''), JSON.stringify([r.noi, r.exp.length, r.price, r.units]));
    check('REAL workbook: the rent roll ($651,420 a year) and the statement\'s gross income ($670,020) DISAGREE by $18,600; the discrepancy is reported and neither figure is adjusted', r.xc && r.xc[0] && r.xc[0].ok === false && r.xc[0].diff === 18600 && /DISCREPANCY inside the workbook/.test(r.notes || ''), JSON.stringify(r.xc));
    check('REAL workbook rent roll (headers "Building / Unit Number / Bed Count / Bath Count / Deposit Amt / Rent Amt", tenant column untitled): 38 units across two buildings (same unit numbers in both), 33 occupied, two printed subtotals tie', q.read && q.units === 38 && q.occupied === '33' && /2 printed subtotals tie/.test(q.warn), JSON.stringify(q));
  } else console.log('SKIPPED real-workbook checks (set BK_REAL_STATE_XLSX)');
  check('no page errors', errs.length === 0, errs.join('|'));
  console.log(checks + ' checks, ' + fails + ' failures'); await b.close(); process.exit(fails ? 1 : 0);
})();
