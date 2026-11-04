// Intake layer, format-independent readers. Real-document text fixtures (page text the importer's own reader returned for documents supplied by the user) are marked REAL; hand-written inputs are marked SYNTHETIC and prove
// the rule, not the real-world coverage.
//  1 a list of properties (LoopNet favourites folder, REAL): 12 rows = the 12 the list says; each row's price, size and printed cap equal the same property's own listing page (52 Hoyt St, 743-751 Arctic St); "On Request" is not stated
//  2 a spreadsheet owner worksheet (REAL): read as text pages, the statement is found by its own arithmetic: NOI $346,211.48 and 6 expense lines that add to Total Expenses; units are not guessed
//  3 a statement whose expense lines do not add up is NOT read (SYNTHETIC)
//  4 a flyer with facts and no income (REAL): facts-only deal, nothing invented, address read from its heading, price / units entered by the user
//   node audit/intake_test.js index.html
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); const path = require('path'), fs = require('fs');
const FX = n => fs.readdirSync(path.join(__dirname, 'fixtures', n)).sort((a, b) => parseInt(a.slice(1)) - parseInt(b.slice(1))).map(f => fs.readFileSync(path.join(__dirname, 'fixtures', n, f), 'utf8'));
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined }); let checks = 0, fails = 0;
  const check = (n, ok, d) => { checks++; if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? '  [' + String(d).slice(0, 300) + ']' : '')); };
  const p = await b.newPage({ viewport: { width: 1300, height: 900 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route(/supabase\.co|vercel\.app|fonts\.g|cdn\.jsdelivr/, r => r.abort()); await p.goto('file://' + path.resolve(process.argv[2])); await p.waitForTimeout(700);
  await p.evaluate(() => { document.documentElement.classList.add('bk-auth-ok'); bkCreateNewDeal({ name: 'x', dealId: 'X' }); });

  /* 1 list */
  { const r = await p.evaluate(([fav, hoyt, arctic]) => { const o = bkOMParse(fav), h = bkOMParse(hoyt), a = bkOMParse(arctic), row = n => o.listRows.find(x => x.name === n);
      const S = bkOMState(); S.om = o; S.result = true; S.listIndex = true; S.mode = 'om'; S.file = { name: 'Favorites.pdf' }; showSheet('Import OM'); return { o: JSON.parse(JSON.stringify(o)), h: { price: h.price, sf: h.sf, cap: h.capRates.cur }, a: { price: a.price, sf: a.sf, cap: a.capRates.cur }, hr: row('52 Hoyt St'), ar: row('743-751 Arctic St'), ui: document.querySelector('#viewport').innerText }; }, [FX('loopnet_favorites_pages'), FX('loopnet_hoyt_pages'), FX('loopnet_arctic_pages')]);
    const o = r.o, R = o.listRows;
    check('list (REAL, LoopNet favourites): recognised as a list; 12 rows read, matching the 12 properties the list says it holds', o.layout === 'list' && R.length === 12 && o.listCount === 12);
    check('list: names, cities and types are read for every row (e.g. 83 Washington St, Norwalk CT, Apartment; 850 East Main Street Portfolio, Stamford CT, Multi Family)', R.every(x => x.name && x.city && x.state === 'CT' && x.type) && R[0].name === '83 Washington St' && R[0].city === 'Norwalk' && R[1].type === 'Multi Family', JSON.stringify(R[1]));
    check('list: "Price Upon Request" and "On Request" cap rates are kept as not stated (no number)', R.filter(x => x.price == null).map(x => x.name).join('|') === '51 Schuyler Ave|134 Mount Pleasant Rd' && R.filter(x => x.capPrinted == null).length === 6 && R[5].priceText === 'Price Upon Request');
    check('list: a size range ("4,000 - 6,042 SF", 2 properties) is kept as a range; "Bldg. Size" and "Size" are kept as labelled', R[1].sizeLow === 4000 && R[1].sizeHigh === 6042 && R[1].properties === 2 && R[3].sizeLabel === 'Building size' && R[0].sizeLabel === 'Size');
    check('list: the 52 Hoyt St and 743-751 Arctic St rows equal the same properties\' own listing pages (price, building size, printed cap rate)', r.hr.price === r.h.price && r.hr.sizeLow === r.h.sf && Math.abs(r.hr.capPrinted - r.h.cap) < 1e-9 && r.ar.price === r.a.price && r.ar.sizeLow === r.a.sf && Math.abs(r.ar.capPrinted - r.a.cap) < 1e-9, JSON.stringify([r.hr, r.h]));
    check('list: the review page shows the table and says it holds no income, expenses or units; rows with no price cannot start a deal', /list of 12 properties, matching the 12/.test(r.ui) && /nothing about income, expenses or units/.test(r.ui) && /not stated/.test(r.ui));
    const d = await p.evaluate(() => { const S = bkOMState(), i = S.om.listRows.findIndex(x => x.name === '52 Hoyt St'); bkOMIndexCreate(i); const s = bkLoad(); return { name: s.name, loc: s.location, price: s.purchasePrice, gsf: s.gsf, units: s.units, noi: bkCalc().noi, imp: Object.keys((s._imp || {}).fields || {}), cap: s._omListing && s._omListing.printedCapRate, t12: s.t12noi }; });
    check('list: "Start deal" on the Hoyt row creates a deal with the list\'s name, location, price and 7,599 SF only: no units, no NOI (not derived from the printed 4.05% cap rate), units and rents flagged', d.name === '52 Hoyt St' && d.loc === 'Stamford, CT' && d.price === 1995000 && d.gsf === 7599 && !d.units && !d.t12 && d.noi === 0 && d.cap === 0.0405 && d.imp.indexOf('units') >= 0 && d.imp.indexOf('avgRent') >= 0, JSON.stringify(d)); }

  /* 2 spreadsheet */
  { const r = await p.evaluate((pages) => { bkCreateNewDeal({ name: 'x', dealId: 'X' }); const o = bkOMParse(pages), S = bkOMState(); S.om = o; S.basis = 'cur'; S.dec = {}; const b = bkOMBuild(o, 'cur', 'State.xlsx'), c = bkOMConf(o, b, null, 'cur'); return { o: JSON.parse(JSON.stringify(o)), d: b.deal, tie: b.tie, want: b.want, conf: Object.fromEntries(Object.entries(c.fields).map(([k, v]) => [k, v.l])) }; }, FX('intake_state_sheet_pages'));
    const I = r.o.ie || {};
    check('spreadsheet (REAL owner worksheet, read as sheet text): found without a heading: NOI $346,211.48 and Total Expenses $290,307.52', !!I.noi && Math.abs(I.noi.cur - 346211.48) < 0.01 && Math.abs(I.expTot.cur - 290307.52) < 0.01 && r.o.looseIE === true, JSON.stringify([I.noi, I.expTot]));
    check('spreadsheet: six expense lines, each from its own cell (R/E Taxes $161,886; Insurance $45,000; Maint / Manage $50,921.52; Water/Sewer $19,000; electric and gas $8,000; Trash/Grounds $5,500), adding to the total; street numbers in neighbouring cells are not read as amounts', I.exp.length === 6 && Math.abs(I.exp.reduce((a, e) => a + e.cur, 0) - 290307.52) < 0.01 && I.exp[0].label === 'R/E Taxes' && I.exp[0].cur === 161886 && I.exp.every(e => e.cur >= 5000), JSON.stringify(I.exp.map(e => [e.label, e.cur])));
    check('spreadsheet: price $9,800,000 and the printed 3.53% cap rate are read; the unit count is NOT guessed (left for the user)', r.o.price === 9800000 && Math.abs(r.o.capRates.cur - 0.0353) < 1e-9 && !r.o.units && r.conf.units !== 'verified', JSON.stringify([r.o.price, r.o.units]));
    check('spreadsheet: gross income, vacancy total and effective gross income are read where printed, and the page ties (EGI less expenses = NOI)', I.gsr.cur === 670020 && I.vac.cur === 33501 && I.egi.cur === 636519 && I.recon.cur.every(c => c.ok), JSON.stringify(I.recon.cur.map(c => [c.id, c.ok])));
    check('spreadsheet: the deal built from it recomputes in the engine to the printed NOI (tie within $5)', r.tie != null && Math.abs(r.tie - r.want) <= 5, JSON.stringify([r.tie, r.want])); }

  /* 3 synthetic negative */
  { const r = await p.evaluate(() => { const syn = ['Gross Income  $100,000\nEffective gross Income  $95,000\nR/E Taxes  $20,000\nInsurance  $5,000\nTotal Expenses  $40,000\nNet Operating Income (NOI)  $55,000']; const o = bkOMParse(syn); return { noi: !!(o.ie && o.ie.noi) }; });
    check('SYNTHETIC: a statement whose expense lines ($25,000) do not add up to the printed Total Expenses ($40,000) is not read as a statement (no figure is accepted that the page itself contradicts)', r.noi === false); }
  { const r = await p.evaluate(() => { const syn = ['Gross Income  $100,000\nEffective gross Income  $95,000\nR/E Taxes  $20,000\nInsurance  $5,000\nRepairs  $15,000\nTotal Expenses  $40,000\nNet Operating Income (NOI)  $55,000']; const o = bkOMParse(syn); return { noi: o.ie && o.ie.noi && o.ie.noi.cur, n: o.ie && o.ie.exp.length }; });
    check('SYNTHETIC: the same statement with the missing line added (adds up) is read: NOI $55,000, 3 expense lines', r.noi === 55000 && r.n === 3, JSON.stringify(r)); }

  /* 4 flyer, facts only */
  { await p.evaluate(() => bkCreateNewDeal({ name: 'x', dealId: 'X' }));
    const r = await p.evaluate((pages) => { const o = bkOMParse(pages); const S = bkOMState(); S.listIndex = false; S.om = o; S.mode = 'om'; S.result = true; S.listingOnly = true; S.file = { name: '115 W 183rd flyer.pdf' }; S.info = null; showSheet('Import OM'); return { o: JSON.parse(JSON.stringify(o)), ui: document.querySelector('#viewport').innerText }; }, FX('intake_bronx_flyer_pages'));
    check('flyer (REAL, 115 W 183rd St): price $2,650,000 and 8,000 SF read; the address and city come from the heading ("115 W 183rd St Bronx, NY")', r.o.price === 2650000 && r.o.sf === 8000 && r.o.street === '115 W 183rd St' && r.o.city === 'Bronx' && r.o.state === 'NY', JSON.stringify([r.o.price, r.o.sf, r.o.street, r.o.city]));
    check('flyer: no income table, so no NOI or income is invented; the review page asks for the units it could not find and names what is not stated', !r.o.ie && !r.o.curNOI && /Units \(not found\)/i.test(r.ui) && /states no income or expenses/.test(r.ui));
    const d = await p.evaluate(() => { const S = bkOMState(); bkOMManual('mUnits', '11'); bkOMCreateListing(); const s = bkLoad(); return { name: s.name, price: s.purchasePrice, units: s.units, gsf: s.gsf, noi: bkCalc().noi, rent: s.avgRent, loc: s.location }; });
    check('flyer: after the user enters 11 units the deal is created with the facts only (price, 8,000 SF, Bronx NY); income and rent stay empty', d.name === '115 W 183rd St' && d.price === 2650000 && d.units === 11 && d.gsf === 8000 && !d.rent && d.noi === 0 && d.loc === 'Bronx, NY', JSON.stringify(d)); }
  check('no page errors', errs.length === 0, errs.join('|'));
  console.log(checks + ' checks, ' + fails + ' failures'); await b.close(); process.exit(fails ? 1 : 0);
})();
