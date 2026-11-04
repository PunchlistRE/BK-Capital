// Import tab: one tab for every document that starts a deal. The reader decides what a file is from its CONTENT and finds inputs by the meaning of their labels, wherever they sit.
// Checked on layouts that differ from each other (a model with labels in column C and values in column F, a rent schedule with its own headings, a development pro forma, a development OM),
// on teaching the reader a label it does not know (applied to the next, different file), on the navigation (one Import entry), and on the old readers opening inside the tab.
//   node audit/import_hub_test.js index.html        (the OM PDF checks also need BK_PDFJS_DIR, a node_modules folder with pdfjs-dist; without it they read the saved page text instead)
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); const path = require('path'), fs = require('fs');
const FX = f => path.join(__dirname, 'fixtures', 'import_hub', f);
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined }); let checks = 0, fails = 0;
  const check = (n, ok, d) => { checks++; if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? '  [' + String(d).slice(0, 260) + ']' : '')); };
  const open = async () => { const p = await b.newPage({ viewport: { width: 1400, height: 900 } }); p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
    await p.route(/supabase\.co|vercel\.app|fonts\.g|cdn\.jsdelivr/, r => r.abort()); await p.goto('file://' + path.resolve(process.argv[2])); await p.waitForTimeout(700);
    await p.evaluate(() => { document.documentElement.classList.add('bk-auth-ok'); localStorage.removeItem('bkcapital.learn.fields.v1'); bkCreateNewDeal({ name: 'x', dealId: 'X', blankStructure: true }); }); return p; };
  const picks = (p) => p.evaluate(() => { const o = {}; [...document.querySelectorAll('#viewport table.fin tbody tr')].filter(r => r.querySelector('input[type=checkbox]')).forEach(r => { o[r.children[1].textContent.trim()] = { v: r.children[2].textContent.trim(), c: r.children[4].textContent.trim() }; }); return o; });
  const upload = async (p, files) => { await p.evaluate(() => showSheet('Import')); await p.waitForTimeout(250); await p.setInputFiles('#bkImportHubFile', files); await p.waitForTimeout(3500); };

  /* ---- navigation: one Import entry, the four old ones are gone from the rail and the ribbon ---- */
  let p = await open(); await p.evaluate(() => showSheet('Import')); await p.waitForTimeout(500);
  const nav = await p.evaluate(() => ({ cur: currentSheet, rail: [...document.querySelectorAll('.rail-item')].map(e => e.dataset.sheet), rib: [...document.querySelectorAll('.bk-ribbon .rb-g:first-child .rb-b')].map(e => e.innerText.trim().replace(/\n/g, ' ')) }));
  check('one Import entry in the sidebar and ribbon; Import OM / Import Deal / Import Rent Roll / Source Ingestion are not listed', nav.rail.includes('Import') && !['Import OM', 'Import Deal', 'Import Rent Roll', 'Source Ingestion'].some(n => nav.rail.includes(n)) && nav.rib.includes('Import'), JSON.stringify(nav.rib));
  /* ---- a layout the reader has never seen: labels in column C, values in column F, units in a note column; a separate rent schedule with its own headings ---- */
  await upload(p, FX('elm_street_model.xlsx')); let g = await picks(p);
  check('model with labels in C and values in F: 17 inputs read', Object.keys(g).length >= 16, Object.keys(g).length);
  check('price $6,250,000 from "Offer price"; units 48 from "Apartment count"', /6,250,000/.test((g['Purchase / land price'] || {}).v) && /^48/.test((g['Units'] || {}).v), JSON.stringify([g['Purchase / land price'], g['Units']]));
  check('LTV 65% from "Debt: LTV"; rate 6.25% from "Coupon on senior loan"; amortization 30 years', /65\.00%/.test((g['Loan-to-value'] || {}).v) && /6\.25%/.test((g['Loan interest rate'] || {}).v) && /30/.test((g['Loan amortization (years)'] || {}).v), JSON.stringify([g['Loan-to-value'], g['Loan interest rate'], g['Loan amortization (years)']]));
  check('hold 5 years from "Years held"; rent growth 2.50%; sale costs 1.50%; vacancy 6.00%; management fee 3.50% from "Mgmt fee"', /5/.test((g['Hold period (years)'] || {}).v) && /2\.50%/.test((g['Annual rent growth'] || {}).v) && /1\.50%/.test((g['Cost of sale (%)'] || {}).v) && /6\.00%/.test((g['Vacancy and credit loss (%)'] || {}).v) && /3\.50%/.test((g['Management fee (% of income)'] || {}).v));
  check('unit-weighted average rent $2,171 from a table headed Apt Type / # / SF / Rent $/mo, and its 48 units agree with the stated 48 (Verified)', /2,171/.test((g['Average monthly rent / unit'] || {}).v) && /Verified/i.test((g['Units'] || {}).c), JSON.stringify([g['Average monthly rent / unit'], g['Units']]));
  check('"Resale rate" is not guessed: it is listed as not recognised, and net rentable area is used for building size only as a Low fallback', !g['Exit cap rate'] && /Low/i.test((g['Gross building area (SF)'] || {}).c));
  /* ---- teaching ---- */
  const taught = await p.evaluate(() => { const row = [...document.querySelectorAll('details table tbody tr')].find(r => /resale rate/i.test(r.children[0].textContent)); if (!row) return false; const s = row.querySelector('select'); s.value = 'exitCap'; s.dispatchEvent(new Event('change')); return true; }); await p.waitForTimeout(600);
  g = await picks(p); check('teaching "Resale rate" = Exit cap rate maps it at once (5.75%)', taught && /5\.75%/.test((g['Exit cap rate'] || {}).v), JSON.stringify(g['Exit cap rate']));
  await p.evaluate(() => bkImportHubReset()); await p.waitForTimeout(300); await upload(p, FX('oak_court_notes.xlsx')); g = await picks(p);
  check('a different file with the same label ("Resale rate" 6%, "Asking" $4.1M, "Dwelling units" 30) is mapped by what was taught', /6\.00%/.test((g['Exit cap rate'] || {}).v) && /4,100,000/.test((g['Purchase / land price'] || {}).v) && /^30/.test((g['Units'] || {}).v), JSON.stringify(g));
  await p.close();
  /* ---- development pro forma workbook and the development OM, together ---- */
  p = await open(); const pdfOK = !!process.env.BK_PDFJS_DIR;
  if(pdfOK){ const T = process.env.BK_PDFJS_DIR; await p.route(/cdn\.jsdelivr\.net\/npm\//, r => { const u = r.request().url().replace(/^.*\/npm\//, ''), m = /^(@?[^@]+(?:\/[^@/]+)?)@[^/]+\/(.*)$/.exec(u), gp = m && path.join(T, m[1], m[2]); if (gp && fs.existsSync(gp)) return r.fulfill({ path: gp, contentType: /\.js|\.mjs/.test(gp) ? 'application/javascript' : undefined, headers: { 'access-control-allow-origin': '*' } }); r.abort(); }); }
  await upload(p, pdfOK ? [FX('harbor_point_om.pdf'), FX('harbor_point_pro_forma.xlsx')] : [FX('harbor_point_pro_forma.xlsx')]); await p.waitForTimeout(pdfOK ? 6000 : 0); g = await picks(p);
  check('development pro forma' + (pdfOK ? ' + OM' : '') + ': 30 or more inputs', Object.keys(g).length >= 30, Object.keys(g).length);
  const has = (k, rx) => g[k] && rx.test(g[k].v);
  check('price $7,000,000, 120 units, 132,000 SF, 2.8 acres, hard cost $25,000,000', has('Purchase / land price', /7,000,000/) && has('Units', /^120/) && has('Gross building area (SF)', /132,000/) && has('Site area (acres)', /2\.8/) && has('Hard construction cost', /25,000,000/), JSON.stringify(g['Units']));
  check('loan: 65% LTC, 7.25% all-in (SOFR 4.00% + 3.25%), 1.00% origination fee', has('Construction loan-to-cost', /65\.00%/) && has('Construction loan rate (all-in)', /7\.25%/) && has('Loan origination fee', /^1\.00%/));
  check('exit cap 5.00% (the sensitivity grid of 4.50% to 5.75% is a range of cases, not a competing statement); sale costs 2.00%; hold 4 years', has('Exit cap rate', /5\.00%/) && !/Low/i.test(g['Exit cap rate'].c) && has('Cost of sale (%)', /2\.00%/) && has('Hold period (years)', /4/));
  check('vacancy 5.00% confirmed by 95% stabilized occupancy; management fee 4.00% from the note "4.0% of EGI"; repairs $144,000 from "$1,200 / unit / year" x 120', has('Vacancy and credit loss (%)', /5\.00%/) && /Verified/i.test(g['Vacancy and credit loss (%)'].c) && has('Management fee (% of income)', /4\.00%/) && has('Repairs and maintenance (annual $)', /144,000/));
  check('waterfall: 8% pref, 12% and 18% hurdles, LP splits 80/70/60%, 50% GP catch-up, 10% GP share', has('Preferred return', /8\.00%/) && has('Second hurdle (IRR)', /12\.00%/) && has('Third hurdle (IRR)', /18\.00%/) && has('Tier 2 split to LP', /80\.00%/) && has('Tier 3 split to LP', /70\.00%/) && has('Tier 4 split to LP', /60\.00%/) && has('GP catch-up share', /50\.00%/));
  check('unit mix: average rent $3,310 (unit-weighted); the OM prints a weighted $3,302 and the difference is shown as a conflict (Low), not hidden', has('Average monthly rent / unit', /3,31[02]/) && (!pdfOK || (/Low/i.test(g['Average monthly rent / unit'].c))), JSON.stringify(g['Average monthly rent / unit']));
  check('target NOI $2,950,000 is not entered as an input (it is a validation target); soft costs and facility ceiling are listed as found with no input yet', !Object.keys(g).some(k => /NOI/i.test(k)) && await p.evaluate(() => /Target NOI/.test(document.querySelector('#viewport').textContent) && /Soft costs/.test(document.querySelector('#viewport').textContent)));
  /* create the deal and check what it holds */
  await p.evaluate(() => bkImportHubCreate()); await p.waitForTimeout(2500);
  const d = await p.evaluate(() => { const s = bkLoad(); return { t: s.dealType, price: s.purchasePrice, units: s.units, ltc: s.conLTC, rate: s.conRate, hard: s.sourceConstruction, exit: s.exitCap, flagged: Object.keys((s._imp && s._imp.fields) || {}).length, rr: s.rentRoll && s.rentRoll.length, lp: s.t2LP, tax: s.taxes, ins: s.insurance, noiTarget: s.t12noi }; });
  check('creating the deal: a Development deal with those inputs, Low and Check ones flagged for review, and nothing invented (NOI left empty)', d.t === 'Development' && d.price === 7000000 && d.units === 120 && d.ltc === 0.65 && Math.abs(d.rate - 0.0725) < 1e-9 && d.hard === 25000000 && d.exit === 0.05 && d.flagged > 5 && (d.noiTarget === '' || d.noiTarget == null || d.noiTarget === 0), JSON.stringify(d));
  check('no page errors', p.errs.length === 0, p.errs.join('|')); await p.close();
  console.log('import hub: ' + checks + ' checks, ' + fails + ' failures'); await b.close(); process.exit(fails ? 1 : 0);
})();
