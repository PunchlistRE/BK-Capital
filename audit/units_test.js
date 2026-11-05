// Mixed-use properties in the Property Editor: residential units and commercial units are separate (with the total), the commercial area is shown with them,
// and Market > Market Rent shows the commercial rents beside the residential ones. Display and one new input: no engine figure may move.
//   node audit/units_test.js index.html
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); const path = require('path');
const A = require(path.join(__dirname, 'deal.js')), V = require(path.join(__dirname, 'devdeal.js'));
const RR = []; for (let i = 1; i <= 24; i++) RR.push({ unit: String(100 + i), tenantType: 'Residential', status: 'Occupied', sf: 1100, inPlaceRent: 1500 + i, marketRent: 1600, tenant: 'Resident ' + i });
for (let i = 1; i <= 6; i++) RR.push({ unit: 'C' + i, tenantType: 'Commercial', status: i < 6 ? 'Occupied' : 'Vacant', sf: 816, inPlaceRent: 2400, marketRent: 2600, recovery: 300, tenant: 'Suite ' + i });
const MIXED = { name: '6 East Sidney Avenue', units: 24, gsf: 33436, gla: 0, commercialArea: 4895, commercialUnits: undefined, rentRoll: RR };
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  let checks = 0, fails = 0; const check = (n, ok, d) => { checks++; if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? '  [' + String(d).slice(0, 420) + ']' : '')); };
  const open = async (deal, over) => { const p = await (await b.newContext({ viewport: { width: 1200, height: 1000 } })).newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
    await p.route(/supabase\.co|vercel\.app|fonts\.g|cdn\.jsdelivr/, r => r.abort()); await p.goto('file://' + path.resolve(process.argv[2])); await p.waitForTimeout(700);
    await p.evaluate(([d, o]) => { document.documentElement.classList.add('bk-auth-ok'); bkCreateNewDeal(d); const s = bkLoad(); Object.assign(s, d, o || {}); bkSave(s); window.__ser = (v) => JSON.stringify(v, (k, x) => (typeof x === 'number' && !Number.isFinite(x) ? '#' + x : x)); }, [deal, over]); return p; };
  /* each form row: the box's value under the label, the unit written beside it under label + '#u' */
  const rows = (p, tab, sub) => p.evaluate(async ([tab, sub]) => { bkEdSub(tab, sub); await new Promise(r => setTimeout(r, 250)); const o = {}; document.querySelectorAll('#viewport .ae-form > label').forEach(l => { const d = l.nextElementSibling, e = d && d.firstElementChild, u = d && d.querySelector('.ae-unit'); o[l.textContent.trim()] = e ? (/^(INPUT|SELECT)$/.test(e.tagName) ? e.value : e.textContent.trim()) : ''; o[l.textContent.trim() + '#u'] = u ? u.textContent.trim() : ''; }); return o; }, [tab, sub]);
  /* the figures only: the deal's own record (key s) and time stamps are left out, since the record gains the new key and the stamps differ on every run */
  const snap = (p) => p.evaluate(() => { const r = bkMonthlyReturns(), ser = (v) => JSON.stringify(v, (k, x) => (k === 's' || k === 'appliedAt' || k === '_history' ? undefined : (typeof x === 'number' && !Number.isFinite(x) ? '#' + x : x))); return ser({ calc: bkCalc(), irr: r.irr, moic: r.moic, rows: r.rows, annual: bkAnnualCF(), debt: bkDebt() }); });

  /* 1-3: Area Measures for the owner's deal: 24 apartments, 6 suites, 4,895 SF of commercial area in 33,436 GSF */
  let p = await open(A, MIXED); let r = await rows(p, 'Property', 'area');
  check('Area Measures: Residential Units, Commercial Units, Total Units, the areas and the averages are separate rows; no "Residential / Rentable Units"', ['Residential Units', 'Commercial Units', 'Total Units', 'Gross Building Area (GBA)', 'Commercial Area (Retail / Office)', 'Residential Area', 'Average Residential Unit', 'Average Commercial Suite'].every(k => k in r) && !('Residential / Rentable Units' in r), Object.keys(r).filter(k => !/#u$/.test(k)).join(' | '));
  check('with 24 residential units and no commercial units entered: Total Units is 24; commercial area 4,895 SF is 14.6% of gross; residential area 28,541; average residential unit 1,189 GSF', r['Total Units'] === '24' && /14\.6\d?% of gross/.test(r['Commercial Area (Retail / Office)#u']) && r['Residential Area'] === '28,541' && r['Average Residential Unit'] === '1,189', JSON.stringify([r['Total Units'], r['Commercial Area (Retail / Office)#u'], r['Residential Area'], r['Average Residential Unit']]));
  const before = await p.evaluate(() => JSON.stringify(bkLoad()));
  await p.evaluate(async () => { const e = document.getElementById('ae-commercialUnits'); e.value = '6'; e.dispatchEvent(new Event('change', { bubbles: true })); await new Promise(r => setTimeout(r, 300)); });
  r = await rows(p, 'Property', 'area'); const st = await p.evaluate(() => bkLoad());
  check('typing 6 Commercial Units saves commercialUnits = 6, leaves Residential Units at 24, and the total reads 30 (24 residential + 6 commercial); the average suite is 816 SF', st.commercialUnits === 6 && st.units === 24 && r['Total Units'] === '30' && /24 residential \+ 6 commercial/.test(r['Total Units#u']) && r['Average Commercial Suite'] === '816', JSON.stringify([st.commercialUnits, st.units, r['Total Units'], r['Total Units#u'], r['Average Commercial Suite']]));
  check('the only difference in the saved deal is the new key (nothing else was changed by entering it)', (() => { const a = JSON.parse(before), c = JSON.parse(JSON.stringify(st)); delete c.commercialUnits; delete c._history; delete a._history; const ks = new Set(Object.keys(a).concat(Object.keys(c))); const d = [...ks].filter(k => JSON.stringify(a[k]) !== JSON.stringify(c[k]) && !/^(_|updated|saved|lastSaved)/.test(k)); return d.length === 0; })());

  /* 4: the rent roll cross-check */
  await p.close(); p = await open(A, MIXED); r = await rows(p, 'Property', 'area');
  const btn = await p.evaluate(() => [...document.querySelectorAll('#viewport button')].map(b => b.textContent.trim()).find(t => /rent roll's 6 commercial suites/.test(t)) || null);
  check('with a 30-row rent roll (24 residential, 6 commercial): "Rent Roll Says 24 + 6" and a button offers the 6 suites', r['Rent Roll Says'] === '24 + 6' && /30 rows/.test(r['Rent Roll Says#u'] || '') && !!btn, JSON.stringify([r['Rent Roll Says'], r['Rent Roll Says#u'], btn]));
  const was = await p.evaluate(() => { const s = bkLoad(); return { u: s.units, g: s.gsf, a: s.avgRent, ca: s.commercialArea }; });
  await p.evaluate(async () => { [...document.querySelectorAll('#viewport button')].find(b => /commercial suites/.test(b.textContent)).click(); await new Promise(r => setTimeout(r, 300)); }); const now = await p.evaluate(() => { const s = bkLoad(); return { cu: s.commercialUnits, u: s.units, g: s.gsf, a: s.avgRent, ca: s.commercialArea }; });
  check('the button sets Commercial Units to 6 and nothing else', now.cu === 6 && now.u === was.u && now.g === was.g && now.a === was.a && now.ca === was.ca, JSON.stringify([was, now]));
  await p.close();

  /* 5: no engine figure moves (bit for bit), on an acquisition and a development deal, with the new input blank and set */
  for (const [nm, deal] of [['acquisition', A], ['development', V]]) { const a = await open(deal, Object.assign({}, MIXED, { name: deal.name })), c = await open(deal, Object.assign({}, MIXED, { name: deal.name, commercialUnits: 6 }));
    const x = await snap(a), y = await snap(c); check(nm + ' deal: the calculation, the monthly returns, the annual cash flow and the debt are identical bit for bit with Commercial Units blank and with 6 (' + Math.round(x.length / 1000) + ' KB compared)', x === y && x.length > 5000, x === y ? '' : 'differs'); await a.close(); await c.close(); }

  /* 6: Deal Underwrite */
  p = await open(A, Object.assign({}, MIXED, { commercialUnits: 6 })); const du = await p.evaluate(async () => { showSheet('Deal Underwrite'); await new Promise(r => setTimeout(r, 600)); const o = {}; document.querySelectorAll('#viewport table.fin tbody tr').forEach(tr => { const t = tr.children[0] && tr.children[0].textContent.trim(); if (t) o[t] = (tr.children[1] ? tr.children[1].textContent.trim() : '') + ' | ' + (tr.children[2] ? tr.children[2].textContent.trim() : ''); }); return o; });
  check('Deal Underwrite > Program: Residential Units 24, Commercial Units 6, Total Units 30; no "Rentable Units"', /^24/.test(du['Residential Units'] || '') && /^6/.test(du['Commercial Units'] || '') && /^30/.test(du['Total Units'] || '') && !('Rentable Units' in du), JSON.stringify([du['Residential Units'], du['Commercial Units'], du['Total Units']]));
  check('Deal Underwrite: the average residential unit is the residential area over the residential units (28,541 / 24 = 1,189.2), not the whole building over them', /^1,189\.2/.test(du['Average Residential Unit Size'] || ''), du['Average Residential Unit Size']);

  /* 7: registry */
  const reg = await p.evaluate(() => { const f = BKReg.field('commercialUnits'); return { has: !!f, kind: f && f.kind, help: !!(f && f.help), lint: (BKReg.lint ? BKReg.lint() : null) }; });
  check('the registry defines commercialUnits once (an integer with its help text) and its lint passes', reg.has && reg.kind === 'int' && reg.help && (reg.lint === null || (Array.isArray(reg.lint) ? reg.lint.length === 0 : !!reg.lint.ok || reg.lint === true)), JSON.stringify(reg).slice(0, 200));
  await p.close();

  /* 8: Market > Market Rent */
  p = await open(A, Object.assign({}, MIXED, { commercialUnits: 6 })); r = await rows(p, 'Market', 'rent'); const note = await p.evaluate(() => document.querySelector('#viewport').textContent);
  check('Market Rent: the residential panel reads the rent roll (in-place $1,513, market $1,600, loss to lease 5.50%) instead of saying there is no roll', r['In-Place Rent (rent roll)'] === '$1,513' && r['Market Rent (rent roll)'] === '$1,600' && r['Loss to Lease Implied by the Roll'] === '5.50%' && !/There is no (residential )?unit rent roll/.test(note), JSON.stringify([r['In-Place Rent (rent roll)'], r['Market Rent (rent roll)'], r['Loss to Lease Implied by the Roll']]));
  const calc = await p.evaluate(() => bkCalc().commercial);
  check('Market Rent: the commercial panel shows the area, the base rent the model uses (the revenue engine\'s own $175,200, $35.78 / SF), market $38.24 and in-place $35.78 / SF from the rent roll, loss to lease 6.4%', Math.abs(calc - 175200) < 1e-6 && r['Commercial Area'] === '4,895' && r['Base Rent Used in the Model'] === '$175,200' && r['Base Rent per Square Foot'] === '35.78' && r['Market Rent'] === '38.24' && r['In-Place Rent'] === '35.78' && r['Loss to Lease Implied'] === '6.40%', JSON.stringify([calc, r['Base Rent Used in the Model'], r['Base Rent per Square Foot'], r['Market Rent'], r['In-Place Rent'], r['Loss to Lease Implied']]));
  await p.close(); p = await open(A, { commercialArea: 4895, commercialRent: 30, rentRoll: [] }); r = await rows(p, 'Market', 'rent');
  check('with no rent roll and a flat retail rent of $30 on 4,895 SF the commercial panel says so: base rent used $146,850 from the flat retail inputs, $30.00 / SF', r['Base Rent Used in the Model'] === '$146,850' && r['Base Rent per Square Foot'] === '30.00' && /flat retail inputs/.test(r['Base Rent Used in the Model#u'] || ''), JSON.stringify([r['Base Rent Used in the Model'], r['Base Rent per Square Foot']])); await p.close();
  p = await open(A, { commercialArea: 0, commercialRent: 0, rentRoll: [] }); const none = await p.evaluate(async () => { bkEdSub('Market', 'rent'); await new Promise(r => setTimeout(r, 250)); return document.querySelector('#viewport').textContent; });
  check('a property with no commercial space says so on the commercial panel instead of showing blank rows', /no commercial space entered/.test(none)); await p.close();

  /* 9: Clear inputs clears the new input too */
  p = await open(A, Object.assign({}, MIXED, { commercialUnits: 6 })); const cleared = await p.evaluate(() => { bkCreateNewDeal({ dealId: 'X1', dealType: 'Acquisition', blankStructure: true, clearAll: true }); const s = bkLoad(); return { cu: s.commercialUnits, units: s.units }; });
  check('Clear inputs leaves no commercial units on the cleared deal', !cleared.cu && !cleared.units, JSON.stringify(cleared)); const errs = p.errs.slice(); await p.close();
  check('no page errors', errs.length === 0, errs.slice(0, 2).join(' | '));
  console.log(checks + ' checks, ' + fails + ' failures'); await b.close(); process.exit(fails ? 1 : 0);
})();
