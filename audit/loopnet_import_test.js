// Import OM, LoopNet listings (a saved or printed listing page): 52 Hoyt St, Stamford CT (priced, with unit mix and a financial summary) and 743-751 Arctic St, Bridgeport CT (priced, no rents, no financials).
// Page text in audit/fixtures/loopnet_*_pages is what the importer's own reader returns for each page of the real listing PDF. With BK_LOOPNET_HOYT, BK_LOOPNET_ARCTIC (the PDFs) and BK_PDFJS_DIR (a node_modules folder
// holding pdfjs-dist) set, the same checks also run through the real upload (file input, PDF.js reader).
//   node audit/loopnet_import_test.js index.html
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); const path = require('path'), fs = require('fs');
const FX = n => fs.readdirSync(path.join(__dirname, 'fixtures', n)).sort((a, b) => parseInt(a.slice(1)) - parseInt(b.slice(1))).map(f => fs.readFileSync(path.join(__dirname, 'fixtures', n, f), 'utf8'));
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined }); let checks = 0, fails = 0;
  const check = (n, ok, d) => { checks++; if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? '  [' + String(d).slice(0, 300) + ']' : '')); };
  const open = async (route) => { const p = await b.newPage({ viewport: { width: 1400, height: 900 } }); p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
    await p.route(/supabase\.co|vercel\.app|fonts\.g/, r => r.abort());
    await p.route(/cdn\.jsdelivr\.net\/npm\//, r => { const T = process.env.BK_PDFJS_DIR; if (!route || !T) return r.abort(); const u = r.request().url().replace(/^.*\/npm\//, ''), m = /^(@?[^@]+(?:\/[^@/]+)?)@[^/]+\/(.*)$/.exec(u), g = m && path.join(T, m[1], m[2].split('?')[0]); if (g && fs.existsSync(g)) r.fulfill({ path: g }); else r.abort(); });
    await p.goto('file://' + path.resolve(process.argv[2])); await p.waitForTimeout(700); await p.evaluate(() => { document.documentElement.classList.add('bk-auth-ok'); bkCreateNewDeal({ name: 'x', dealId: 'X' }); }); return p; };
  const pagesH = FX('loopnet_hoyt_pages'), pagesA = FX('loopnet_arctic_pages');

  /* ---- 52 Hoyt St ---- */
  const hoyt = async (p, viaUpload, file) => {
    const tag = 'Hoyt' + (viaUpload ? ' (real PDF upload)' : '');
    let st;
    if (viaUpload) { await p.evaluate(() => showSheet('Import OM')); await p.waitForTimeout(300); await p.setInputFiles('#bkOMFile', file); await p.waitForFunction(() => /✓ Read |could not find|Could not/i.test(document.querySelector('#viewport').innerText), null, { timeout: 300000 }); await p.waitForTimeout(500);
      st = await p.evaluate(() => { const S = bkOMState(), o = S.om, b = bkOMBuild(o, 'cur', 'x.pdf'), c = bkOMConf(o, b, S.info, 'cur'); return { o: JSON.parse(JSON.stringify(o)), d: b.deal, tie: b.tie, want: b.want, notes: b.notes, conf: c.fields, ui: document.querySelector('#viewport').innerText, listingOnly: !!S.listingOnly }; }); }
    else st = await p.evaluate((pages) => { bkCreateNewDeal({ name: 'x', dealId: 'X' }); const o = bkOMParse(pages), S = bkOMState(); S.om = o; S.basis = 'cur'; S.dec = {}; const b = bkOMBuild(o, 'cur', 'hoyt.pdf'), c = bkOMConf(o, b, null, 'cur'); return { o: JSON.parse(JSON.stringify(o)), d: b.deal, tie: b.tie, want: b.want, notes: b.notes, conf: c.fields, listingOnly: false }; }, pagesH);
    const o = st.o, d = st.d, I = o.ie || {};
    check(tag + ': recognized as a LoopNet listing (not another OM layout), income and expense table found', o.layout === 'loopnet' && !!I.noi && !st.listingOnly);
    check(tag + ': identity: 52 Hoyt St, Stamford, CT 06905 (the icon glyphs after the address are removed)', o.street === '52 Hoyt St' && o.city === 'Stamford' && o.state === 'CT' && o.zip === '06905' && d.name === '52 Hoyt St' && d.location === 'Stamford, CT', JSON.stringify([o.street, o.city, o.state, o.zip, d.name]));
    check(tag + ': asking price $1,995,000 and 7 units (not the 100% occupancy read as 100 units)', o.price === 1995000 && o.units === 7 && d.purchasePrice === 1995000 && d.units === 7, JSON.stringify([o.price, o.units]));
    check(tag + ': Property Facts: 7,599 SF building, built 1916, 3 stories, zoning RMF, lot 11,761 SF = 0.27 acres', o.sf === 7599 && o.yearBuilt === 1916 && o.stories === 3 && /^RMF/.test(o.zoning) && o.listing.lotSF === 11761 && o.lotAcres === 0.27 && d.gsf === 7599 && d.siteArea === 0.27, JSON.stringify([o.sf, o.yearBuilt, o.stories, o.zoning, o.lotAcres]));
    check(tag + ': unit mix: 7 rows read with units, rent and SF; rents add to $12,450 a month', o.unitMix.length === 7 && o.unitMix.reduce((a, m) => a + m.units, 0) === 7 && o.unitMix.reduce((a, m) => a + m.cur, 0) === 12450 && o.unitMix[0].type === 'Studios' && o.unitMix[0].cur === 1450 && o.unitMix[0].sf === 700 && o.unitMix[5].sf === 1200, JSON.stringify(o.unitMix.slice(0, 2)));
    check(tag + ': printed cap rate 4.05% and printed occupancy 100% kept as printed', o.capRates && o.capRates.cur === 0.0405 && o.listing.occupancy === 1);
    check(tag + ': financial summary (Actual - 2025): gross rental income $149,400, taxes $25,719, operating expenses $42,678, total $68,397, NOI $81,003; other income and vacancy loss "--" are recorded as not stated, not as zero figures', I.gsr.cur === 149400 && I.egi.cur === 149400 && I.exp.length === 2 && I.exp[0].cur === 25719 && I.exp[1].cur === 42678 && I.expTot.cur === 68397 && I.noi.cur === 81003 && (I.notStated || []).join() === 'Other income,Vacancy loss' && o.listing.finPeriod === 'Actual - 2025', JSON.stringify(I.notStated));
    check(tag + ': the page reconciles: unit-mix rents x 12 = gross rental income, expenses add up, EGI less expenses = NOI', I.recon.cur.length === 4 && I.recon.cur.every(c => c.ok), JSON.stringify(I.recon.cur.map(c => [c.id, c.ok])));
    check(tag + ': source pages recorded for each figure (price p1, facts p2, unit mix and income p3, NOI p4)', o.sources.price === 1 && o.sources.facts === 2 && o.sources.unitMix === 3 && o.sources.income === 3 && o.sources.noi === 4, JSON.stringify(o.sources));
    check(tag + ': deal fields: average rent $1,778.57 (12,450 / 7), other income $0, vacancy 0%, taxes $25,719, other expenses $42,678, no management fee invented', Math.abs(d.avgRent - 1778.57) < 0.01 && d.otherIncomePerUnit === 0 && d.vacancy === 0 && d.taxes === 25719 && d.ga === 42678 && d.mgmtPct === 0 && d.insurance === 0 && d.utilities === 0 && d.rm === 0, JSON.stringify([d.avgRent, d.vacancy, d.taxes, d.ga, d.mgmtPct, d.insurance]));
    check(tag + ': the deal\'s NOI recomputes in the engine to the listing\'s $81,003', st.tie != null && Math.abs(st.tie - 81003) < 1 && st.want === 81003, JSON.stringify([st.tie, st.want]));
    check(tag + ': confidence: price, units, area, rent and taxes verified; vacancy and other income "check" (stated absences); insurance, repairs and other missing lines "low"', st.conf.purchasePrice.l === 'verified' && st.conf.units.l === 'verified' && st.conf.gsf.l === 'verified' && st.conf.taxes.l === 'verified' && st.conf.vacancy.l === 'check' && st.conf.otherIncomePerUnit.l === 'check' && st.conf.insurance.l === 'low' && st.conf.rm.l === 'low' && st.conf.mgmtPct.l === 'assumed', JSON.stringify(Object.fromEntries(Object.entries(st.conf).map(([k, v]) => [k, v.l]))));
    check(tag + ': the review notes carry the listing\'s own qualifiers: the 48-52 vs 52 address, 6 of 7 month-to-month, estate / executor, expenses not itemised', ['48-52 Hoyt', 'six of 7 tenants', 'estate', 'Property Tax and Operating Expenses only'].every(s => st.notes.join(' ').indexOf(s) >= 0), st.notes.join(' | ').slice(0, 300));
    return st; };
  { const p = await open(false); await hoyt(p, false); await p.close(); }

  /* accept, open, edit, calculate and report */
  { const p = await open(false);
    const r = await p.evaluate((pages) => { bkCreateNewDeal({ name: 'x', dealId: 'X' }); const o = bkOMParse(pages), S = bkOMState(); S.om = o; S.basis = 'cur'; S.dec = {}; S.file = { name: 'hoyt.pdf' }; S.info = null; bkOMCreate(); const s = bkLoad(), c = bkCalc(), html = bkReportHTML(); const txt = new DOMParser().parseFromString(html, 'text/html').body.innerText.replace(/\s+/g, ' ');
      const s2 = bkLoad(); s2.insurance = 14000; bkSave(s2); const c2 = bkCalc();
      return { name: s.name, price: s.purchasePrice, units: s.units, noi: c.noi, egi: c.egi, noi2: c2.noi, imp: s._imp ? Object.keys(s._imp.fields) : null, rep: ['$1,995,000', '$81,003', '52 Hoyt St', 'Stamford'].map(x => txt.indexOf(x) >= 0), nan: /NaN|undefined|Infinity/.test(txt), draft: /Draft: inputs missing/.test(txt), rd: bkDealReadiness().state }; }, pagesH);
    check('Hoyt: the accepted deal opens with the listing\'s price, units and name; the engine NOI is $81,003 and EGI $149,400', r.name === '52 Hoyt St' && r.price === 1995000 && r.units === 7 && Math.abs(r.noi - 81003) < 1 && Math.abs(r.egi - 149400) < 1, JSON.stringify(r));
    check('Hoyt: editing an input (insurance $14,000) flows to the engine: NOI falls by exactly $14,000', Math.abs(r.noi - r.noi2 - 14000) < 1, r.noi2);
    check('Hoyt: the investor PDF states the price, NOI, address, prints no NaN / undefined, and is not marked a draft (the deal has what it needs)', r.rep.every(Boolean) && !r.nan && !r.draft && r.rd !== 'DRAFT', JSON.stringify([r.rep, r.nan, r.rd]));
    check('Hoyt: figures read with low or check confidence are stamped on the deal for review', r.imp && r.imp.indexOf('insurance') >= 0 && r.imp.indexOf('vacancy') >= 0, JSON.stringify(r.imp));
    await p.close(); }

  /* ---- 743-751 Arctic St ---- */
  const arctic = async (p, viaUpload, file) => {
    const tag = 'Arctic' + (viaUpload ? ' (real PDF upload)' : '');
    let st;
    if (viaUpload) { await p.evaluate(() => showSheet('Import OM')); await p.waitForTimeout(300); await p.setInputFiles('#bkOMFile', file); await p.waitForFunction(() => /✓ Read |could not find|Could not/i.test(document.querySelector('#viewport').innerText), null, { timeout: 300000 }); await p.waitForTimeout(500);
      st = await p.evaluate(() => { const S = bkOMState(); return { o: JSON.parse(JSON.stringify(S.om)), listingOnly: !!S.listingOnly, result: !!S.result, ui: document.querySelector('#viewport').innerText }; }); }
    else st = await p.evaluate((pages) => { const o = bkOMParse(pages); return { o: JSON.parse(JSON.stringify(o)), listingOnly: true, result: true }; }, pagesA);
    const o = st.o;
    check(tag + ': recognized as a LoopNet listing and taken as a listing with no financials (not an error)', o.layout === 'loopnet' && !o.ie && st.listingOnly && st.result);
    check(tag + ': identity: 743-751 Arctic St, Bridgeport, CT 06608', o.street === '743-751 Arctic St' && o.city === 'Bridgeport' && o.state === 'CT' && o.zip === '06608', JSON.stringify([o.street, o.city, o.state, o.zip]));
    check(tag + ': asking price $1,800,000, 11 units ($163,636 a unit)', o.price === 1800000 && o.units === 11 && o.listing.pricePerUnit === 163636, JSON.stringify([o.price, o.units]));
    check(tag + ': property facts: 13,392 SF, built 1904, 3 stories, zoning MXN, lot 5,227 SF = 0.12 acres, 9,642 SF of living area stated', o.sf === 13392 && o.yearBuilt === 1904 && o.stories === 3 && /^MXN/.test(o.zoning) && o.listing.lotSF === 5227 && o.lotAcres === 0.12 && o.listing.livingSF === 9642 && o.listing.grossAreaText === 13392, JSON.stringify([o.sf, o.yearBuilt, o.zoning, o.lotAcres, o.listing.livingSF]));
    check(tag + ': unit counts from the description: 3 commercial, 4 two-bedroom, 4 one-bedroom = 11, with no rents invented', o.unitMix.map(m => m.units + ' ' + m.type).join('|') === '3 Commercial|4 2-Bedroom/1-Bathroom|4 1-Bedroom/1-Bathroom' && o.unitMix.every(m => m.cur === null), JSON.stringify(o.unitMix));
    check(tag + ': the printed 9.34% cap rate is kept as printed; no NOI, rents or expenses are read or derived', o.capRates.cur === 0.0934 && !o.curNOI && !o.pfNOI && !o.ie && !o.avgCur);
    return st; };
  { const p = await open(false); await arctic(p, false); await p.close(); }
  { const p = await open(false);
    await p.evaluate((pages) => { bkCreateNewDeal({ name: 'x', dealId: 'X' }); const o = bkOMParse(pages), S = bkOMState(); S.om = o; S.mode = 'om'; S.result = true; S.listingOnly = true; S.file = { name: 'arctic.pdf' }; S.info = null; showSheet('Import OM'); }, pagesA); await p.waitForTimeout(500);
    const ui = await p.evaluate(() => document.querySelector('#viewport').innerText);
    const r = await p.evaluate(() => { bkOMCreateListing(); const s = bkLoad(), c = bkCalc(), txt = new DOMParser().parseFromString(bkReportHTML(), 'text/html').body.innerText.replace(/\s+/g, ' ');
      return { name: s.name, loc: s.location, price: s.purchasePrice, units: s.units, gsf: s.gsf, type: s.propertyType, acres: s.siteArea, avgRent: s.avgRent, t12: s.t12noi, taxes: s.taxes, ins: s.insurance, noi: c.noi, imp: s._imp && s._imp.fields, lst: s._omListing, nan: /NaN|undefined|Infinity/.test(txt), rep: ['$1,800,000', '743-751 Arctic St'].map(x => txt.indexOf(x) >= 0), draft: /Draft: inputs missing/.test(txt) && /Not assessed/.test(txt) }; }); r.ui = ui;
    const html = await p.evaluate(() => bkReportHTML()); const q = await b.newPage({ viewport: { width: 900, height: 1200 } }); await q.setContent(html); await q.waitForTimeout(300);
    const lay = await q.evaluate(() => { const P = [...document.querySelectorAll('.page')]; return { n: P.length, over: P.map((s, i) => { const ft = s.querySelector('.ft2'), bd = s.querySelector('.bd'); if (!ft || !bd) return null; return Math.max(...[...bd.querySelectorAll('*')].map(e => e.getBoundingClientRect().bottom)) > ft.getBoundingClientRect().top - 2 ? i + 1 : null; }).filter(Boolean) }; }); await q.close();
    check('Arctic: the review page says the listing states no income or expenses, shows each fact with its source page, and marks rents and expenses "not stated"', /states no income or expenses/.test(r.ui) && /not stated/.test(r.ui) && /OM page 2/.test(r.ui) && /168,120/.test(r.ui) && /not loaded/.test(r.ui), r.ui.slice(r.ui.indexOf('This is a LoopNet'), r.ui.indexOf('This is a LoopNet') + 200));
    check('Arctic: the deal is created with the listing\'s facts only (name, location, price, 11 units, 13,392 SF, 0.12 acres, mixed-use)', r.name === '743-751 Arctic St' && r.loc === 'Bridgeport, CT' && r.price === 1800000 && r.units === 11 && r.gsf === 13392 && r.acres === 0.12 && r.type === 'Mixed-Use', JSON.stringify(r));
    check('Arctic: nothing is invented: no rent, no expenses, and the NOI implied by the cap rate ($168,120) is not entered anywhere', !r.avgRent && !r.t12 && !r.taxes && !r.ins && Math.abs(r.noi - 168120) > 1, JSON.stringify([r.avgRent, r.t12, r.noi]));
    check('Arctic: the missing fields are flagged low on the deal for entry, and the listing\'s unit counts, printed cap rate and source pages are kept with it', r.imp && r.imp.avgRent && r.imp.avgRent.l === 'low' && r.imp.taxes && r.imp.taxes.l === 'low' && r.lst && r.lst.printedCapRate === 0.0934 && r.lst.unitMix.length === 3 && r.lst.pages.price === 1, JSON.stringify([r.imp && Object.keys(r.imp), r.lst]));
    check('Arctic: the investor PDF says the deal is a draft with core inputs missing, does not assess the credit gate, and no page overflows', r.draft && lay.n === 8 && !lay.over.length, JSON.stringify([r.draft, lay]));
    check('Arctic: the deal opens, the engine does not fail, and the investor PDF states the price and address without NaN / undefined', Number.isFinite(r.noi) && r.rep.every(Boolean) && !r.nan, JSON.stringify([r.noi, r.rep, r.nan]));
    await p.close(); }

  /* a document that is not a LoopNet listing is read as before */
  { const p = await open(false); const r = await p.evaluate(() => { const o = bkOMParse(['FOR SALE - Sample - 10 Main Street, Town, CT\nUNITS 12\nPrice $1,000,000']); return { layout: o.layout || null, units: o.units }; }); check('a page without a LoopNet listing ID and Property Facts is not read as a listing', r.layout !== 'loopnet' && r.units === 12, JSON.stringify(r)); await p.close(); }

  /* the real upload path, when the PDFs and PDF.js are available */
  const HP = process.env.BK_LOOPNET_HOYT, AP = process.env.BK_LOOPNET_ARCTIC;
  if (HP && AP && process.env.BK_PDFJS_DIR && fs.existsSync(HP) && fs.existsSync(AP)) {
    { const p = await open(true); await hoyt(p, true, HP); const cv = await p.evaluate(() => { const c = bkOMState().info.cover; return c ? { size: c.size, type: c.type } : null; }); check('Hoyt (real PDF upload): the listing\'s main photo (the largest image on page 1) is extracted as the cover picture', cv && cv.size > 100000 && /image/.test(cv.type), JSON.stringify(cv)); check('Hoyt (real PDF upload): no page errors', p.errs.length === 0, p.errs.join('|')); await p.close(); }
    { const p = await open(true); const st = await arctic(p, true, AP); const cv2 = await p.evaluate(() => { const c = bkOMState().info.cover; return c ? { size: c.size, type: c.type } : null; }); check('Arctic (real PDF upload): the main photo is extracted as the cover picture', cv2 && cv2.size > 100000 && /image/.test(cv2.type), JSON.stringify(cv2)); check('Arctic (real PDF upload): the page offers "Create deal from these facts"', /Create deal from these facts/.test(st.ui)); check('Arctic (real PDF upload): no page errors', p.errs.length === 0, p.errs.join('|')); await p.close(); }
  } else console.log('SKIPPED real-PDF checks (set BK_LOOPNET_HOYT, BK_LOOPNET_ARCTIC and BK_PDFJS_DIR)');
  console.log(checks + ' checks, ' + fails + ' failures'); await b.close(); process.exit(fails ? 1 : 0);
})();
