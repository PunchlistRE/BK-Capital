// Reports: cash flow, valuation, tenant and audit reports. The cash flow must reconcile with the engine's own annual and monthly figures; the present values must discount the same cash flow that produces the IRR.
//   node audit/reports_test.js index.html
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); const path = require('path'), fs = require('fs');
const A = require(path.join(__dirname, 'deal.js')), D = require(path.join(__dirname, 'devdeal.js'));
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined }); const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true }), p = await ctx.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message)); await p.route(/supabase\.co|vercel\.app|fonts\.g/, r => r.abort());
  await p.goto('file://' + path.resolve(process.argv[2])); await p.waitForTimeout(700);
  let checks = 0, fails = 0; const check = (n, ok, d) => { checks++; if (!ok) { fails++; console.log('FAIL ' + n + (d ? '  ' + d : '')); } };
  const fresh = deal => p.evaluate(a => { document.documentElement.classList.add('bk-auth-ok'); bkCreateNewDeal(a); }, deal);
  await fresh(Object.assign({}, A, { capex: [{ name: 'Roof', month: '2028-07', amount: 55000 }], miscIncome: [{ name: 'Antenna', amount: 15000, freq: 'Annually' }] }));
  check('Reports is a navigation group of the five property reports (plus the Refinance Report and the Property Valuation Report) with a ribbon tab', await p.evaluate(() => { const g = GROUPS.find(x => x.id === 'reports'); return !!g && g.sheets.join() === 'Cash Flow Report,Valuation Report,Tenant Report,Lease Schedule,Audit Report,Refinance Report,Property Valuation Report' && NAV_TABS.some(t => t.id === 'reports'); }));
  /* cash flow reconciles with the engine */
  const r = await p.evaluate(() => { const cf = bkRpCashFlow(), ac = bkAnnualCF(), m = bkMonthlyReturns(), n = ac.arr.length, f = cf.f, d = bkDebt(), out = { n, egr: [], noib: [], noi: [], eqYears: [] };
    for (let y = 1; y <= n; y++) { out.egr.push(Math.abs(f.egr(y) - ac.arr[y - 1].egi)); out.noib.push(Math.abs(f.noib(y) - ac.arr[y - 1].noi)); out.noi.push(Math.abs(f.noi(y) - ac.arr[y - 1].after)); }
    for (let y = 2; y < n; y++) { const s = m.rows.slice((y - 1) * 12, y * 12).reduce((t, r) => t + r.cf, 0); out.eqYears.push(Math.abs(s - f.eq(y))); }
    let all = 0; for (let y = 1; y <= n; y++) all += f.eq(y) + f.saleNet(y); const rowsCf = m.rows.reduce((t, r) => t + r.cf, 0) + Number(d.equity) + Number(bkLoad().rateCapCost || 0);
    return Object.assign(out, { totalGap: Math.abs(all - rowsCf), all, rowsCf }); });
  check('cash flow: effective gross revenue, NOI before reserves and NOI equal the engine\'s annual figures in every year', r.egr.every(v => v < 1e-6) && r.noib.every(v => v < 1e-6) && r.noi.every(v => v < 1e-6), JSON.stringify([Math.max(...r.egr), Math.max(...r.noib), Math.max(...r.noi)]));
  check('cash flow: equity cash flow from operations equals the engine\'s monthly cash flow in every full operating year (debt service, asset fee and the capital item included)', r.eqYears.every(v => v < 1e-3), JSON.stringify(r.eqYears));
  check('cash flow: all years of operations plus the sale equal the engine\'s whole levered cash flow', r.totalGap < 1e-2, JSON.stringify([r.all, r.rowsCf]));
  await p.evaluate(() => showSheet('Cash Flow Report')); await p.waitForTimeout(300);
  const dom = await p.evaluate(() => { const t = document.getElementById('rp-cashflow'), rows = [...t.querySelectorAll('tbody tr')].map(r => [...r.children].map(c => c.textContent)), noi = rows.find(r => r[0] === 'Net Operating Income'), ac = bkAnnualCF(); return { cols: t.querySelector('thead tr').children.length, ends: [...t.querySelectorAll('thead tr.rp-pe th')].slice(1, 1 + bkAnnualCF().arr.length).map(c => c.textContent.trim()), noiY1: noi && noi[1].replace('$',''), expect: Math.round(ac.arr[0].noi).toLocaleString('en-US'), totalCol: noi && noi[noi.length - 2].replace('$',''), sumExp: Math.round(ac.arr.reduce((s, a) => s + a.noi, 0)).toLocaleString('en-US'), n: ac.arr.length, bad: (t.innerText.match(/undefined|NaN/g) || []).length }; });
  check('the cash flow table shows the Year-1 Net Operating Income (before capital reserves, the Argus definition: the engine\'s annual NOI) and a Total column that adds the years', dom.noiY1 === dom.expect && dom.totalCol === dom.sumExp && dom.bad === 0 && dom.cols === 1 + dom.n + 2, JSON.stringify(dom));
  check('the cash flow table heads each year with its period ending (Argus layout: "Dec-2027")', dom.ends.length === dom.n && dom.ends.every(e => /^[A-Z][a-z]{2}-\d{4}$/.test(e)), JSON.stringify(dom.ends));
  await p.selectOption('.rp-bar select', 'unit'); await p.waitForTimeout(300);
  const unit = await p.evaluate(() => { const t = document.getElementById('rp-cashflow'), rows = [...t.querySelectorAll('tbody tr')].map(r => [...r.children].map(c => c.textContent)), noi = rows.find(r => r[0] === 'Net Operating Income'); return { v: noi[1].replace('$',''), expect: Math.round(bkAnnualCF().arr[0].noi / bkLoad().units).toLocaleString('en-US') }; });
  check('the per-unit view divides every figure by the units', unit.v === unit.expect, JSON.stringify(unit));
  await p.selectOption('.rp-bar select', 'total');
  /* Argus layout (Cash Flow, Detailed Lines): the sections and lines in Argus order, the subtotals add, and nothing that was a number before has moved */
  const ag = await p.evaluate(() => { showSheet('Cash Flow Report'); const t = document.getElementById('rp-cashflow'), lab = [...t.querySelectorAll('tbody tr')].map(r => ({ l: r.cells[0].textContent.trim(), c: r.className })), L = lab.map(x => x.l);
    const cf = bkRpCashFlow(), f = cf.f, ac = bkAnnualCF(), m = bkMonthlyReturns(), d = bkDebt(), n = ac.arr.length, gap = [], fee = [], ds = [];
    const yr = (y, k) => m.rows.slice((y - 1) * 12, y * 12).reduce((t, r) => t + Number(r[k]), 0);
    for (let y = 1; y <= n; y++) {
      gap.push(Math.abs(f.pgr(y) - (f.sched(y) + f.oth(y))), Math.abs(f.egr(y) - (f.pgr(y) + f.vac(y) + f.bad(y))), Math.abs(f.cfb(y) - (f.noib(y) + f.totLC(y))), Math.abs(f.totCap(y) - (f.capItems(y) + f.res(y))),
        Math.abs(f.cfa(y) - (f.cfb(y) + f.ds(y))), Math.abs(f.eq(y) - (f.cfa(y) + f.fee(y))), Math.abs(f.leasing(y) - (f.ti(y) + f.lc(y))));
      fee.push(f.fee(y) === -yr(y, 'assetFee') && f.dispo(y) === -yr(y, 'dispoFee'));
      ds.push(Math.abs(f.intr(y) + f.prin(y) - f.ds(y)));
    }
    return { L, secs: lab.filter(x => x.c === 'sec').map(x => x.l), gap: Math.max(...gap), fee: fee.every(Boolean), ds: Math.max(...ds), nsp: f.nsp(n) === Number(ac.netSale), noiRow: lab.find(x => x.l === 'Net Operating Income').c, res: L.indexOf('Capital Reserves') > L.indexOf('Net Operating Income') && L.indexOf('Capital Reserves') < L.indexOf('Cash Flow Before Debt Service') }; });
  const order = ['Potential Base Rent - Residential', 'Loss to Lease', 'Free Rent', 'Scheduled Base Rent', 'Other Income', 'Potential Gross Revenue', 'General Vacancy', 'Credit Loss', 'Effective Gross Revenue', 'Real Estate Taxes', 'Insurance', 'Total Operating Expenses', 'Net Operating Income', 'Capital Expenditures', 'Capital Reserves', 'Total Capital Expenditures', 'Cash Flow Before Debt Service', 'Interest Payments', 'Principal Payments', 'Total Debt Service', 'Cash Flow After Debt Service', 'Asset Management Fee', 'Cash Flow Available for Distribution', 'Gross Sale Price', 'Selling Costs', 'Net Sales Price', 'Disposition Fee', 'Loan Payoff', 'Proceeds from Sale'];
  const idx = order.map(l => ag.L.indexOf(l));
  check('Argus layout: the cash flow lines appear in Argus order, Rental Revenue to Proceeds from Sale', idx.every(i => i >= 0) && idx.every((v, i) => !i || v > idx[i - 1]), JSON.stringify(order.filter((l, i) => idx[i] < 0)));
  check('Argus layout: the section headings are Rental Revenue, Other Revenue, Operating Expenses, Capital Expenditures, Debt Service and Sale', ag.secs.join('|') === 'Rental Revenue|Other Revenue|Operating Expenses|Capital Expenditures|Debt Service|Sale (final year)', ag.secs.join('|'));
  check('Argus NOI: Net Operating Income is a total before capital reserves; reserves sit below it with the capital costs, above Cash Flow Before Debt Service', ag.noiRow === 'tot' && ag.res, JSON.stringify([ag.noiRow, ag.res]));
  check('the Argus subtotals add: Potential Gross Revenue, Effective Gross Revenue, Total Capital Expenditures, NOI + leasing and capital costs = Cash Flow Before Debt Service, CFBDS + debt service = CFADS, CFADS + asset fee = Cash Flow Available for Distribution, TI + commissions = leasing costs (every year, within $0.000001)', ag.gap < 1e-6, String(ag.gap));
  check('interest and principal payments add to the engine\'s debt service in every year (within a cent)', ag.ds < 0.01, String(ag.ds));
  check('the asset-management and disposition fees are the engine\'s own monthly figures, bit for bit (not recomputed in the report)', ag.fee);
  check('Net Sales Price is the engine\'s sale price after selling costs', ag.nsp);
  check('no line keeps a superseded label (NOI before Reserves, Scheduled Net Rental Revenue, Capital Items, Cash Flow to Equity from Operations, Net Sale Proceeds to Equity)', !ag.L.some(l => /^(Net Operating Income before Reserves|Scheduled Net Rental Revenue|Capital Items|Cash Flow to Equity from Operations|Net Sale Proceeds to Equity|Replacement Reserves)$/.test(l)), ag.L.join('|'));
  const dl = p.waitForEvent('download'); await p.click('button:has-text("Download CSV")'); const d1 = await dl, csv = fs.readFileSync(await d1.path(), 'utf8');
  check('Download CSV delivers the table with its header row and the NOI row', /^"Dollars","Year 1"/.test(csv) && /"Net Operating Income"/.test(csv), csv.slice(0, 80));
  /* valuation */
  const v = await p.evaluate(() => { const ac = bkAnnualCF(), irr = ac.irr; return { atIrr: bkRpNpv(irr), lo: bkRpNpv(0.06), hi: bkRpNpv(0.12), irr, basis: -ac.initial }; });
  check('valuation: the present value of the unlevered cash flow at its own IRR is zero (within $1), and falls as the discount rate rises', Math.abs(v.atIrr) < 1 && v.lo > v.hi && v.lo > 0, JSON.stringify(v));
  await p.evaluate(() => showSheet('Valuation Report')); await p.waitForTimeout(300);
  const vt = await p.evaluate(() => { const t = document.querySelector('#viewport').innerText, ac = bkAnnualCF(), m = bkMonthlyReturns(); return { u: t.includes((ac.irr * 100).toFixed(2) + '%'), l: t.includes((m.irr * 100).toFixed(2) + '%'), pv: !!document.getElementById('rp-pv'), bad: (t.match(/undefined|NaN/g) || []).length, gross: t.includes('$' + Math.round(ac.grossSale).toLocaleString('en-US')) }; });
  check('the valuation report shows the engine\'s IRRs, gross sale price and a present value table', vt.u && vt.l && vt.pv && vt.gross && vt.bad === 0, JSON.stringify(vt));
  const va = await p.evaluate(() => { const ac = bkAnnualCF(), c = bkCalc(), cf = bkRpCashFlow(), n = ac.arr.length, rows = {}; document.querySelectorAll('#viewport .rp-tbl tbody tr').forEach(r => { if (r.cells.length >= 2) rows[r.cells[0].textContent.trim()] = r.cells[1].textContent.trim(); });
    const sec = [...document.querySelectorAll('#viewport .rp-sec')].map(x => x.textContent.trim()), $ = v => '$' + Math.round(v).toLocaleString('en-US'), $n = v => v < 0 ? '($' + Math.round(-v).toLocaleString('en-US') + ')' : $(v);
    return { sec, noi: rows['Year-1 Net Operating Income'] === $(c.noi), after: rows['Year-1 NOI after Capital Reserves'] === $(c.after), cap: rows['NOI To Capitalize'] === $(ac.terminalNOI), nsp: rows['Net Sales Price'] === $(ac.netSale), proc: rows['Proceeds from Sale'] === $n(cf.f.saleNet(n)), irr: !!rows['IRR (Unleveraged)'] && !!rows['IRR (Leveraged)'] }; });
  check('valuation report in Argus panels: Pricing, Sales Proceeds Calculation, Distributions of Net Proceeds, Return Summary, Present Value of the Unleveraged Cash Flow', va.sec.join('|') === 'Pricing|Sales Proceeds Calculation|Distributions of Net Proceeds|Return Summary|Present Value of the Unleveraged Cash Flow', va.sec.join('|'));
  check('valuation report: Year-1 NOI is before capital reserves (with the after-reserves figure on its own line), NOI To Capitalize is the engine\'s exit NOI, Net Sales Price the engine\'s, and Proceeds from Sale equals the cash flow report\'s final-year line', va.noi && va.after && va.cap && va.nsp && va.proc && va.irr, JSON.stringify(va));
  /* tenant report */
  await p.evaluate(() => { const s = bkLoad(); s.rentRoll = [{ unitId: '101', tenantType: 'Residential', sf: 700, status: 'Occupied', inPlaceRent: 1500, marketRent: 1600, leaseStart: '2026-02-01', leaseEnd: '2027-01-31' }, { unitId: '102', tenantType: 'Residential', sf: 800, status: 'Occupied', inPlaceRent: 1700, marketRent: 1700, leaseStart: '2026-05-01', leaseEnd: '2027-04-30' }, { unitId: '103', tenantType: 'Residential', sf: 900, status: 'Occupied', inPlaceRent: 1800, marketRent: 1900, leaseStart: '2025-09-01', leaseEnd: '2028-08-31' }, { unitId: '104', tenantType: 'Residential', sf: 650, status: 'Vacant', inPlaceRent: 0, marketRent: 1550, leaseStart: '', leaseEnd: '' }]; bkSave(s); showSheet('Tenant Report'); }); await p.waitForTimeout(300);
  const tr = await p.evaluate(() => { const rows = [...document.querySelectorAll('#rp-exp tbody tr')].map(r => [...r.children].map(c => c.textContent)); return { rows, txt: document.querySelector('#viewport').innerText }; });
  check('tenant report: expirations group occupied leases by year with their area and annual rent (two in 2027, one in 2028; the vacant unit is not counted)', tr.rows.length === 2 && tr.rows[0][0] === '2027' && tr.rows[0][1] === '2' && tr.rows[0][2] === '1,500' && tr.rows[0][4] === '$38,400' && tr.rows[1][0] === '2028' && tr.rows[1][1] === '1', JSON.stringify(tr.rows));
  check('tenant report: the summary counts 3 of 4 units occupied', /Occupied[\s\S]{0,20}3\b/.test(tr.txt) && /Units \/ Suites[\s\S]{0,12}4/.test(tr.txt));
  /* audit */
  await p.evaluate(() => { const s = bkLoad(); s._imp = { source: 't', at: '2026-01-01', fields: { exitCap: { l: 'check', why: 'Read from a page image.' } } }; bkSave(s); bkEdSet('exitCap', 'pct', '5.9'); bkHistoryFlush(); showSheet('Audit Report'); }); await p.waitForTimeout(400);
  const au = await p.evaluate(() => { const t = document.querySelector('#viewport').innerText; return { value: /Exit cap rate[\s\S]{0,40}5\.90%/.test(t), flag: /check: Read from a page image/.test(t), change: /exitCap/.test(t), extra: /miscellaneous income line/.test(t) && /capital item/.test(t) && /rent roll of 4 rows/.test(t) }; });
  check('audit: inputs as entered, the import flag, the recent change to the exit cap, and the extra settings are all listed', au.value && au.flag && au.change && au.extra, JSON.stringify(au));
  /* development deals get a pointer, not wrong numbers */
  await fresh(D); await p.evaluate(() => showSheet('Cash Flow Report')); await p.waitForTimeout(200);
  check('a development deal gets a pointer to its own schedules instead of an operating cash flow', await p.evaluate(() => /Dev Schedule/.test(document.querySelector('#viewport').innerText) && !document.getElementById('rp-cashflow')));
  check('no page errors', errs.length === 0, errs.join(' | '));
  await b.close(); console.log(checks + ' checks, ' + fails + ' failures'); process.exit(fails ? 1 : 0);
})();
