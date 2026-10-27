// PDF summary (acquisition): the financial summary and the annual cash flow pages. Every figure is checked against the
// engine: each year's lines add up to the engine's net cash flow to equity, debt service splits into the loan schedule's
// interest and principal, cash-on-cash is cash flow after debt service over equity, and nothing runs into the footer.
//   node audit/summary_test.js index.html
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); const path = require('path');
const A = require(path.join(__dirname, 'deal.js'));
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const p = await b.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route(/supabase\.co|vercel\.app|fonts\.g|cdn\.jsdelivr/, r => r.abort());
  await p.goto('file://' + path.resolve(process.argv[2])); await p.waitForTimeout(700);
  await p.evaluate(() => document.documentElement.classList.add('bk-auth-ok'));
  let checks = 0, fails = 0; const check = (n, ok, d) => { checks++; if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? '  [' + d + ']' : '')); };
  const doc = await b.newPage();
  for (const [tag, deal] of [['5-year hold', A], ['10-year hold', Object.assign({}, A, { holdYears: 10 })],
    ['mixed-use rent roll', Object.assign({}, A, { holdYears: 7, units: 2, gsf: 2800, purchasePrice: 1100000, t12noi: 70000, taxes: 12000, insurance: 4000, payroll: 0, rm: 3000, turnover: 0, utilities: 3000, contract: 0, marketing: 0, ga: 2000, reserves: 600, rentRoll: [
      { unitId: '1A', tenantType: 'Residential', unitType: '1 BR', sf: 700, status: 'Occupied', inPlaceRent: 1600, marketRent: 1650, recovery: 0, leaseStart: '', leaseEnd: '' },
      { unitId: '1B', tenantType: 'Residential', unitType: '2 BR', sf: 900, status: 'Vacant', inPlaceRent: 0, marketRent: 2100, recovery: 0, leaseStart: '', leaseEnd: '' },
      { unitId: 'C1', tenantType: 'Commercial', tenant: 'Corner Deli LLC', sf: 1200, status: 'Occupied', inPlaceRent: 4000, marketRent: 4000, recovery: 0, leaseStart: '2024-01-01', leaseEnd: '2029-12-31' }] })]]) {
    const r = await p.evaluate(d => { bkCreateNewDeal(d); const html = bkReportHTML(), m = bkMonthlyReturns(), D = bkDebt(), H = Math.round(Number(bkLoad().holdYears));
      const yr = (y, k) => m.rows.filter(x => x.y === y).reduce((t, x) => t + (x[k] || 0), 0), close0 = m.rows[0].eqDraw;
      const cf = [], cfads = [], intr = [], prin = [], ds = [];
      for (let y = 1; y <= H; y++) { cf.push(yr(y, 'cf') + (y === 1 ? close0 : 0)); cfads.push(yr(y, 'noi') - yr(y, 'reserve') - yr(y, 'ds') - yr(y, 'assetFee'));
        let i = 0, pr = 0; for (let mm = (y - 1) * 12; mm < y * 12; mm++) { i += D.months[mm].interest; pr += D.months[mm].principal; } intr.push(i); prin.push(pr); ds.push(yr(y, 'ds')); }
      return { html, H, close0, cf, cfads, intr, prin, ds, eq: D.equity, profit: m.dist - m.contrib }; }, deal);
    await doc.setContent(r.html); await doc.waitForTimeout(300);
    const pg = await doc.evaluate(() => { const num = s => { s = String(s || '').trim(); if (!s || s === '–' || s === '—') return 0; const n = Number(s.replace(/[$,()%x\s]/g, '')); return /^\(/.test(s) ? -n : n; };
      const tbl = [...document.querySelectorAll('table.cft')][0], rows = {}; [...tbl.querySelectorAll('tbody tr')].forEach(tr => { const c = [...tr.cells].map(x => x.innerText); if (c.length > 2) rows[c[0]] = c.slice(1).map(num); });
      const mrows = {}; [...document.querySelectorAll('table.mtx tbody tr')].forEach(tr => { const c = [...tr.cells].map(x => x.innerText); mrows[c[0]] = c.slice(2); });
      const thousands = /\$ thousands/i.test(tbl.querySelector('th').innerText);
      /* nothing on a page may reach its footer */
      const over = [...document.querySelectorAll('.page')].map((s, i) => { const ft = s.querySelector('.ft2'); if (!ft) return null; const top = ft.getBoundingClientRect().top; const bd = s.querySelector('.bd'); if (!bd) return null; const bottom = Math.max(...[...bd.querySelectorAll('*')].map(e => e.getBoundingClientRect().bottom)); return bottom > top - 2 ? i + 1 : null; }).filter(Boolean);
      return { pages: document.querySelectorAll('.page').length, rows, mrows, thousands, over, text: document.body.innerText }; });
    const k = pg.thousands ? 1000 : 1, tol = pg.thousands ? 1.01 : 1.01, near = (a, b) => Math.abs(a * k - b) <= tol * k;
    check(tag + ': six pages', pg.pages === 6, pg.pages);
    check(tag + ': ' + (r.H > 7 ? 'figures in $ thousands' : 'figures in whole dollars'), pg.thousands === (r.H > 7));
    check(tag + ': every year\'s net cash flow to equity equals the engine\'s', pg.rows['Net cash flow to equity'].slice(1).every((v, i) => near(v, r.cf[i])), pg.rows['Net cash flow to equity'].slice(1).join(' '));
    check(tag + ': Close shows the equity invested at closing', near(pg.rows['Net cash flow to equity'][0], -r.close0) && near(pg.rows['Equity invested'][0], -r.close0));
    check(tag + ': cash flow after debt service equals the engine\'s', pg.rows['Cash flow after debt service'].slice(1).every((v, i) => near(v, r.cfads[i])));
    check(tag + ': interest and principal come from the loan schedule and add to debt service', pg.rows['Interest'].slice(1).every((v, i) => near(-v, r.intr[i])) && pg.rows['Principal'].slice(1).every((v, i) => near(-v, r.prin[i])) && r.intr.every((v, i) => Math.abs(v + r.prin[i] - r.ds[i]) < 0.01));
    const sumRows = (keys, i) => keys.reduce((t, kk) => t + (pg.rows[kk] ? pg.rows[kk][i] : 0), 0);
    const opLines = ['Real estate taxes', 'Insurance', 'Repairs and maintenance', 'Payroll', 'Turnover', 'Utilities', 'Contract services', 'Marketing', 'General and administrative', 'Other operating', 'Management fee', 'Other expenses'];
    check(tag + ': expense lines add to total operating expenses (to rounding)', pg.rows['Total operating expenses'].slice(1).every((v, i) => Math.abs(sumRows(opLines, i + 1) - v) <= opLines.length * 0.51 + 0.01));
    check(tag + ': each column adds down to the net cash flow (to rounding)', pg.rows['Net cash flow to equity'].slice(1).every((v, i) => Math.abs(sumRows(['NOI after reserves', 'Interest', 'Principal', 'Asset management fee', 'Gross sale price', 'Cost of sale', 'Disposition fee', 'Loan payoff', 'Capital items and leasing costs', 'Refinance proceeds', 'Equity invested'], i + 1) - v) <= 6));
    const coc = pg.mrows['Cash-on-cash return'].map(x => Number(x.replace('%', '')) / 100);
    check(tag + ': cash-on-cash is cash flow after debt service over equity, not 0%', coc.every((v, i) => Math.abs(v - r.cfads[i] / r.eq) < 0.0006) && coc.some(v => v > 0), coc.join(' '));
    check(tag + ': nothing runs into a page footer', pg.over.length === 0, pg.over.join(','));
    check(tag + ': no NaN or undefined', !/NaN|undefined|\[object/.test(pg.text));
    if (/rent roll/.test(tag)) check(tag + ': the rent roll summary lists unit types and the commercial tenant', /Rent roll/i.test(pg.text) && /1 BR/.test(pg.text) && /2 BR/.test(pg.text) && /Corner Deli/.test(pg.text) && /12\/2029/.test(pg.text));
    check(tag + ': the cash flow sums to the deal\'s profit', Math.abs(pg.rows['Net cash flow to equity'].reduce((t, v) => t + v, 0) * k - r.profit) <= (r.H + 1) * k);
  }
  /* the development summary shares the page styles */
  const dv = await p.evaluate(d => { bkCreateNewDeal(d); return bkReportHTML(); }, require(path.join(__dirname, 'devdeal.js')));
  await doc.setContent(dv); await doc.waitForTimeout(300);
  const dover = await doc.evaluate(() => [...document.querySelectorAll('.page')].map((s, i) => { const ft = s.querySelector('.ft2'), bd = s.querySelector('.bd'); if (!ft || !bd) return null; const top = ft.getBoundingClientRect().top; return Math.max(...[...bd.querySelectorAll('*')].map(e => e.getBoundingClientRect().bottom)) > top - 2 ? i + 1 : null; }).filter(Boolean));
  check('development summary: nothing runs into a page footer', dover.length === 0, dover.join(','));
  check('no page errors', errs.length === 0, errs.join(' | '));
  await b.close(); console.log(`${checks} checks, ${fails} failures`); process.exit(fails ? 1 : 0);
})();
