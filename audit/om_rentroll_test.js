// Import OM, rent-roll layout: OMs that print a unit-by-unit rent roll and an expense list instead of an income and
// expense statement, including a two-building offering with one rent roll and one expense column per building. The page
// texts below are synthetic (invented tenants and figures that add up), laid out as PDF.js returns PowerPoint-built OMs.
//   node audit/om_rentroll_test.js index.html
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); const path = require('path');
const ONE = [
  'Offering Memorandum\n12,000SFMixed-UseBuilding for Sale\n14 NorthMapleAvenue\nWhitePlains, NY10601\nCorner of Maple and Main',
  'THE SUMMARY\nA mixed-use building with 6 apartments and 2 retail units.\nPROPERTY OVERVIEW\nProperty Type Mixed-Use\nStories 3\nUnits 8\nBuilding SF 12,400 SF\nZoning C2\nTaxes $40,000\nPrice to Sell:\n$2,400,000',
  ['FINANCIALS', 'INCOME(Rentroll) EXPENSES',
   'Unit Size Monthly Preferential Rent Annual Preferential Rent  Insurance $6,000.00',
   'Apt 1 1 BR $1,500.00 $18,000.00', 'Management Fees $7,000.00',
   'Apt 2 2 BR $2,000.00 $24,000.00',
   'Apt 3 STUDIO $1,200.00 $14,400.00  Real Estate Taxes $40,000.00',
   'Apt 4 1 BR $1,550.00 $18,600.00  Utilities $9,000.00',
   'Apt 5 2 BR $2,100.00 $25,200.00  Total Operating Expenses $62,000.00',
   'Apt 6 JR 1 $1,400.00 $16,800.00  Totals',
   'Retail 1 900 SF $3,000.00 $36,000.00  Gross Revenue $183,000.00',
   'Retail 2 600 SF $2,000.00 $24,000.00  Total Operating Expenses $62,000.00',
   'Net Operating Income $ 1 2 1 , 0 0 0 .', 'CAM Charges N/A $500.00 $6,000.00', '00',
   'Totals $15,250.00 $183,000.00'].join('\n'),
  'AERIAL MAP\nFOR MORE INFORMATION, PLEASE CONTACT:\nBROKER NAME'];
const TWO = [
  'Offering Memorandum\nASKING PRICE FOR BOTH PROPERTIES:\n$4.250,000\n20,000 Total SF Mixed-Use Buildings for Sale\n100-10 Oak Avenue\nRiverdale, NY 10471',
  'PROPERTY OVERVIEW\nProperty Type Mixed-Use\nBuildings 2\nUnits 9 Total\nBuilding SF 8,000 SF | 12,000 SF\nBoth buildings have a tax abatement, an estimated annual savings of $50,000.\nASKING PRICE FOR BOTH PROPERTIES:\n$4.250,000',
  ['FINANCIALS', '100 OAK AV INCOME (Rent roll)', 'Unit Tenant Rent Income Parking Property Tax Lease From Lease To',
   'C1 Acme Dental, PLLC $3,000.00 $50.00 01/01/2025 12/31/2029', 'C2 Vacant $2,500.00',
   '2A Jane Roe $2,000.00 $100.00 03/01/2025 02/28/2026', '2B John Doe $2,100.00 06/01/2025 05/31/2026', 'Storage Space $200.00',
   'Total $9,800.00 $100.00 $50.00', 'Rent Income $9,600.00', 'Annual Income:',
   'Parking $100.00  Monthly Total Income $9,950.00', 'Storage $200.00  Annual Income ($9,950.00 x 12)  $119,400.00',
   'Property Tax $50.00  Annual Operating Expenses  $30,000.00', 'Total $9,950.00  Operating Income:', 'Net Operating Income $89,400.00'].join('\n'),
  ['FINANCIALS', '110 OAK AV INCOME (Rent roll)', 'Unit Tenant Rent Income Parking Property Tax Lease From Lease To',
   'Suite 1 & 2 Bagel Corp $5,000.00 $200.00 01/01/2024 12/31/2030 Rent Increase Yearly', '3A Mary Major $2,200.00 $0.00 01/01/2025 12/31/2025',
   '3B -Free Market 2024 Sam Minor $2,300.00 $0.00 02/01/2025 01/31/2026', '4A Lee Park $2,400.00 $150.00 04/01/2025 03/31/2026',
   'Total $11,900.00 $150.00 $200.00', 'Parking $150.00', 'Annual Income:', 'RE Tax $200.00  Monthly Total Income $12,250.00',
   'Rent Income $11,900.00  Annual Income ($12,250.00 x 12) $147,000.00', 'Total $12,250.00  Annual Operating Expenses $40,000.00', 'Net Operating Income $107,000.00'].join('\n'),
  ['FINANCIALS', '100 OAK AV EXPENSES 110 OAK AV EXPENSES',
   'Insurance $6,000.00 Insurance $8,000.00 Water $5,000.00', 'Management fees 5,000.00 Management fee 7,000.00 Property Tax 12,000.00',
   'Taxes 15,000.00 Elevator Service/Maintenance 3,000.00 Total Operating Expense $40,000.00', 'Repairs and maintenance 4,000.00 Plumbing 5,000.00',
   'Total Operating Expenses $30,000.00', 'NOI for 100 Oak Avenue $89,400.00',
   'NOI for 110 Oak Avenue $107,000.00  Total Expenses (30,000.00 + 40,000.00) $70,000.00', 'Total NOI ($89,400.00 + $ 107,000.00) $196,400.00'].join('\n')];
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const p = await b.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route(/supabase\.co|vercel\.app|fonts\.g|cdn\.jsdelivr/, r => r.abort());
  await p.goto('file://' + path.resolve(process.argv[2])); await p.waitForTimeout(700);
  let checks = 0, fails = 0; const check = (n, ok, d) => { checks++; if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? '  [' + d + ']' : '')); };
  const run = pages => p.evaluate(pages => { document.documentElement.classList.add('bk-auth-ok'); bkCreateNewDeal({ name: 'Scratch', dealId: 'SCRATCH' });
    const om = bkOMParse(pages), bd = bkOMBuild(om, 'cur', 'om.pdf'); bkCreateNewDeal(bd.deal); const c = bkCalc(), s = bkLoad();
    return { om: { name: om.name, city: om.city, state: om.state, zip: om.zip, price: om.price, priceTypo: om.priceTypo || null, units: om.units, unitsOM: om.unitsOM, commSpaces: om.commSpaces, commSF: om.commSF, sf: om.sf, layout: om.layout,
             buildings: om.buildings, expN: om.ie.exp.length, expSum: om.ie.exp.reduce((t, e) => t + e.cur, 0), expTot: om.ie.expTot.cur, noi: om.ie.noi.cur, misc: om.misc },
             tie: bd.tie, want: bd.want, notes: bd.notes, rr: s.rentRoll, misc: s.miscIncome, vac: s.vacancy, units: s.units, type: s.propertyType, noi: c.noi, egi: c.egi, gpr: c.gpr, comm: c.commercial, other: c.other, mgmt: c.mgmt }; }, pages);

  /* 1. one building: two-column page (rent roll beside the expense list), monthly and annual rent columns, a broken NOI */
  let r = await run(ONE);
  check('rent-roll layout recognised', r.om.layout === 'rentroll');
  check('name and place from the cover, with its lost spaces restored', r.om.name === '14 North Maple Avenue' && r.om.city === 'White Plains' && r.om.state === 'NY' && r.om.zip === '10601', `${r.om.name} / ${r.om.city}, ${r.om.state} ${r.om.zip}`);
  check('price read from the line after "Price to Sell:"', r.om.price === 2400000, r.om.price);
  check('building area from the property overview', r.om.sf === 12400, r.om.sf);
  check('6 apartments and 2 retail units (1,500 SF) in the rent roll; 6 + 2 = the 8 units the OM states', r.om.units === 6 && r.om.commSpaces === 2 && r.om.commSF === 1500 && r.om.unitsOM === 8);
  check('every apartment and retail row is in the deal\'s rent roll', r.rr.length === 8 && r.rr.filter(x => x.tenantType === 'Commercial').length === 2);
  check('CAM charges are other income, not a unit', r.misc.length === 1 && r.misc[0].name === 'CAM charges' && r.misc[0].amount === 500);
  check('expense list: 4 lines adding to the OM\'s $62,000 total', r.om.expN === 4 && r.om.expSum === 62000 && r.om.expTot === 62000);
  check('the broken NOI ("$ 1 2 1 , 0 0 0 .") is read as $121,000', r.om.noi === 121000, r.om.noi);
  check('engine: residential rent $117,000, retail $60,000, other income $6,000', Math.abs(r.gpr - 117000) < 0.01 && Math.abs(r.comm - 60000) < 0.01 && Math.abs(r.other - 6000) < 0.01, `${r.gpr} / ${r.comm} / ${r.other}`);
  check('the deal\'s NOI ties to the OM\'s', Math.abs(r.tie - r.want) <= 5 && Math.abs(r.noi - 121000) <= 5, `${r.tie.toFixed(2)} vs ${r.want}`);
  check('vacancy starts at 0% to match the OM, and the notes say so', r.vac === 0 && r.notes.some(n => /no vacancy/.test(n)));
  check('the deal is mixed-use', r.type === 'Mixed-Use');

  /* 2. two buildings: one rent roll each with parking and tax columns, a three-column expense page, a combined NOI */
  r = await run(TWO);
  check('two buildings found', JSON.stringify(r.om.buildings) === JSON.stringify(['100 OAK AV', '110 OAK AV']), r.om.buildings.join(' | '));
  check('"$4.250,000" is read as $4,250,000 and flagged', r.om.price === 4250000 && r.om.priceTypo === '$4.250,000', r.om.price);
  check('the price is not the $50,000 tax saving printed above the label', r.om.price !== 50000);
  check('building area: "20,000 Total SF"', r.om.sf === 20000, r.om.sf);
  check('5 apartments, and 4 commercial spaces (Suite 1 & 2 counts as two); 5 + 4 = the 9 units the OM states', r.om.units === 5 && r.om.commSpaces === 4 && r.om.unitsOM === 9);
  check('the vacant suite is carried at its asking rent, as the OM counts it', r.rr.some(x => /C2$/.test(x.unitId) && x.status === 'Vacant' && x.marketRent === 2500 && x.inPlaceRent === 0));
  check('unit ids carry the building, so the two 3A-style ids stay apart', r.rr.every(x => /^1[01]0 OAK /.test(x.unitId)), r.rr.map(x => x.unitId).join(', '));
  check('tenant and dates are split from the unit code ("3B -Free Market 2024 Sam Minor")', r.rr.some(x => /3B$/.test(x.unitId) && x.tenant === 'Sam Minor' && x.leaseStart === '2025-02-01' && x.leaseEnd === '2026-01-31'));
  const misc = r.misc.map(x => x.name + ' ' + x.amount).sort().join(', ');
  check('other income: storage once (not again from the summary), parking and tax reimbursements from each roll', misc === 'Parking 100, Parking 150, Real estate tax reimbursements 200, Real estate tax reimbursements 50, Storage Space 200', misc);
  check('three-column expense page: 10 lines, adding to the two totals ($30,000 + $40,000)', r.om.expN === 10 && r.om.expSum === 70000 && r.om.expTot === 70000, `${r.om.expN} lines, ${r.om.expSum}`);
  check('combined NOI $196,400 from the "Total NOI" line', r.om.noi === 196400, r.om.noi);
  check('engine income equals the two buildings\' annual income ($119,400 + $147,000)', Math.abs(r.egi - 266400) < 0.01, r.egi);
  check('the deal\'s NOI ties to the combined NOI', Math.abs(r.tie - r.want) <= 5, `${r.tie.toFixed(2)} vs ${r.want}`);
  check('the notes name both buildings and the price typo', r.notes.some(n => /2 buildings/.test(n)) && r.notes.some(n => /\$4\.250,000/.test(n)));

  /* 3. a statement-layout OM is not taken over by the rent-roll reader */
  const st = await p.evaluate(() => { const o = bkOMParse(['FOR SALE - Elm Court - 48 Elm Street, Springfield, MA\nOffering Price $3,000,000\nTotal 20 Units 18,000 SF',
    'OPERATING INCOME\nGross Potential Rent $360,000 $380,000\nVacancy (5.0%) ($18,000) 5.0% ($19,000) 5.0%\nEffective Gross Income $342,000 $361,000\nOPERATING EXPENSES\nReal Estate Taxes $40,000 $41,000\nInsurance $12,000 $12,000\nTotal Expenses $52,000 $53,000\nNet Operating Income $290,000 $308,000']);
    return { layout: o.layout || null, noi: o.ie && o.ie.noi && o.ie.noi.cur, exp: o.ie && o.ie.exp.length, price: o.price }; });
  check('an income and expense statement still reads as before', st.layout === null && st.noi === 290000 && st.exp === 2 && st.price === 3000000, JSON.stringify(st));
  check('no page errors', errs.length === 0, errs.join(' | '));
  await b.close(); console.log(`${checks} checks, ${fails} failures`); process.exit(fails ? 1 : 0);
})();
