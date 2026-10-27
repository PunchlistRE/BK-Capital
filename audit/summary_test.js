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
    /* holds of up to 7 years carry a Total column after the years */
    const totCol = {}; Object.keys(pg.rows).forEach(key => { if (pg.rows[key].length > r.H + 1) totCol[key] = pg.rows[key][r.H + 1]; pg.rows[key] = pg.rows[key].slice(0, r.H + 1); });
    Object.keys(pg.mrows).forEach(key => { pg.mrows[key] = pg.mrows[key].slice(0, r.H); });
    const k = pg.thousands ? 1000 : 1, tol = pg.thousands ? 1.01 : 1.01, near = (a, b) => Math.abs(a * k - b) <= tol * k;
    check(tag + ': seven pages', pg.pages === 7, pg.pages);
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
    if (r.H <= 7) check(tag + ': the Total column is the sum of close and every year', ['Net cash flow to equity', 'Net operating income', 'Interest'].every(key => Math.abs(totCol[key] - pg.rows[key].reduce((s, v) => s + v, 0)) <= r.H + 1), JSON.stringify(totCol['Net cash flow to equity']));
    check(tag + ': no NaN or undefined', !/NaN|undefined|\[object/.test(pg.text));
    if (/rent roll/.test(tag)) check(tag + ': the rent roll summary lists unit types and the commercial tenant', /Rent roll/i.test(pg.text) && /1 BR/.test(pg.text) && /2 BR/.test(pg.text) && /Corner Deli/.test(pg.text) && /12\/2029/.test(pg.text));
    check(tag + ': the cash flow sums to the deal\'s profit', Math.abs(pg.rows['Net cash flow to equity'].reduce((t, v) => t + v, 0) * k - r.profit) <= (r.H + 1) * k);
  }
  /* the distribution waterfall page, rebuilt from the engine's monthly waterfall */
  const readWf = () => doc.evaluate(() => { const num = s => { s = String(s || '').trim(); if (!s || s === '–' || s === '—') return 0; const n = Number(s.replace(/[$,()%x\s]/g, '')); return /^\(/.test(s) ? -n : n; };
    const t = document.querySelector('table.wft'); if (!t) return null; const big = /thousands/i.test(t.querySelector('th').innerText); let sec = 'top'; const S = {};
    [...t.querySelectorAll('tbody tr')].forEach(tr => { if (tr.classList.contains('sec')) { sec = tr.innerText.trim(); S[sec] = {}; return; } const c = [...tr.cells].map(x => x.innerText); (S[sec] = S[sec] || {})[c[0].replace(/\s*\(.*$/, '').trim()] = c.slice(1).map(num); });
    return { S, big, pages: document.querySelectorAll('.page').length }; });
  for (const [tag, deal] of [['upside deal (every tier pays)', require(path.join(__dirname, 'dealB.js'))], ['upside deal, 10 years', Object.assign({}, require(path.join(__dirname, 'dealB.js')), { holdYears: 10 })], ['development deal', require(path.join(__dirname, 'devdeal.js'))]]) {
    const w = await p.evaluate(d => { bkCreateNewDeal(d); const w = bkWaterfallV07(), last = w.rows[w.rows.length - 1]; return { html: bkReportHTML(), lp: w.lp, gp: w.gp, promote: w.promote, b: [last.b1, last.b2, last.b3], t: ['t1', 'catchup', 't2', 't3', 't4'].map(k => w.rows.reduce((s, r) => s + r[k], 0)), s: w.s }; }, deal);
    await doc.setContent(w.html); await doc.waitForTimeout(300); const W = await readWf(), k = W.big ? 1000 : 1, tl = (W.big ? 1000 : 1) * 1.01;
    const secs = Object.keys(W.S), tiers = secs.filter(x => /^TIER [123]/i.test(x)), sumA = a => a.reduce((t, v) => t + v, 0);
    check(tag + ': waterfall page present', !!W && tiers.length === 3);
    check(tag + ': each tier\'s ending balance at the sale equals the engine\'s hurdle account', tiers.every((x, i) => Math.abs(W.S[x]['Ending balance'].slice(-1)[0] * k - w.b[i]) <= tl), tiers.map((x, i) => W.S[x]['Ending balance'].slice(-1)[0] + ' vs ' + Math.round(w.b[i])).join(', '));
    check(tag + ': every hurdle account rolls forward (beginning + accrued + contributions - applied = ending, each year)', tiers.every(x => { const a = W.S[x], acc = Object.keys(a).find(l => /accrued/i.test(l)); return a['Ending balance'].every((e, j) => j === 0 || Math.abs(a['Beginning balance'][j] + a[acc][j] + (a['Contributions'] ? a['Contributions'][j] : 0) + a['Distributions applied'][j] - e) <= 4); }));
    const lpT = sumA(secs.map(x => W.S[x]['Distributed to LP'] ? sumA(W.S[x]['Distributed to LP']) : 0)), gpT = sumA(secs.map(x => W.S[x]['Distributed to GP'] ? sumA(W.S[x]['Distributed to GP']) : 0));
    check(tag + ': tier distributions add to the LP\'s and GP\'s totals', Math.abs(lpT * k - w.lp.dist) <= 30 * tl && Math.abs(gpT * k - w.gp.dist) <= 30 * tl, `${Math.round(lpT * k)} vs ${Math.round(w.lp.dist)}; ${Math.round(gpT * k)} vs ${Math.round(w.gp.dist)}`);
    const pc = W.S['PARTNER CASH FLOWS'] || W.S['Partner cash flows'];
    check(tag + ': LP and GP cash flows sum to their profit, and the promote to the engine\'s', Math.abs(sumA(pc['LP cash flow']) * k - (w.lp.dist - w.lp.contrib)) <= 20 * tl && Math.abs(sumA(pc['GP cash flow']) * k - (w.gp.dist - w.gp.contrib)) <= 20 * tl && Math.abs(sumA(pc['GP promote']) * k - w.promote) <= 20 * tl);
    check(tag + ': cash available for distribution adds to total profit', Math.abs(sumA(W.S.top['Cash flow available for distribution']) * k - (w.lp.dist + w.gp.dist - w.lp.contrib - w.gp.contrib)) <= 20 * tl);
    const over = await doc.evaluate(() => [...document.querySelectorAll('.page')].map((s, i) => { const ft = s.querySelector('.ft2'), bd = s.querySelector('.bd'); if (!ft || !bd) return null; const top = ft.getBoundingClientRect().top; return Math.max(...[...bd.querySelectorAll('*')].map(e => e.getBoundingClientRect().bottom)) > top - 2 ? i + 1 : null; }).filter(Boolean));
    check(tag + ': nothing runs into a page footer', over.length === 0, over.join(','));
  }
  /* the construction funding page (development) */
  const fd = await p.evaluate(d => { bkCreateNewDeal(d); const f = bkDevFundingV10(), last = Math.min(f.months.length, Math.max(f.stab, f.co)); const M = f.months.slice(0, last), S = k => M.reduce((t, r) => t + (r[k] || 0), 0);
    return { html: bkReportHTML(), need: S('need'), eq: S('eq') + S('overflow'), draw: S('loanDraw'), ci: S('capInt'), end: M[last - 1].end }; }, require(path.join(__dirname, 'devdeal.js')));
  await doc.setContent(fd.html); await doc.waitForTimeout(300);
  const F = await doc.evaluate(() => { const num = s => { s = String(s || '').trim(); if (!s || s === '–' || s === '—') return 0; return Number(s.replace(/[$,()%\s]/g, '')); }; const t = document.querySelector('table.drw'); if (!t) return null; const R = {};
    [...t.querySelectorAll('tbody tr')].forEach(tr => { const c = [...tr.cells].map(x => x.innerText); if (c.length > 2) R[c[0].trim()] = c.slice(1).map(num); }); return { R, pages: document.querySelectorAll('.page').length }; });
  const lastOf = a => a[a.length - 1], nearK = (a, b) => Math.abs(a * 1000 - b) <= 1000;
  check('development: seven pages with a construction funding page', F && F.pages === 7);
  check('construction funding: total costs, equity, loan draws and capitalised interest equal the funding engine\'s', nearK(lastOf(F.R['Total costs']), fd.need) && nearK(lastOf(F.R['Construction loan draws']), fd.draw) && nearK(lastOf(F.R['Interest capitalised']), fd.ci) && nearK(lastOf(F.R['Equity']) + (F.R['Equity over plan'] ? lastOf(F.R['Equity over plan']) : 0), fd.eq));
  check('construction funding: every quarter\'s sources equal its costs', F.R['Total sources'].every((v, j) => Math.abs(v - F.R['Total costs'][j]) <= 1));
  check('construction funding: the loan rolls forward each quarter (beginning + draws + interest = ending)', F.R['Ending balance'].slice(0, -1).every((e, j) => Math.abs(F.R['Beginning balance'][j] + F.R['Draws'][j] + F.R['Interest capitalised'][j] - e) <= 2) && nearK(lastOf(F.R['Ending balance']), fd.end));
  /* the development summary shares the page styles */
  const dv = await p.evaluate(d => { bkCreateNewDeal(d); return bkReportHTML(); }, require(path.join(__dirname, 'devdeal.js')));
  await doc.setContent(dv); await doc.waitForTimeout(300);
  const dover = await doc.evaluate(() => [...document.querySelectorAll('.page')].map((s, i) => { const ft = s.querySelector('.ft2'), bd = s.querySelector('.bd'); if (!ft || !bd) return null; const top = ft.getBoundingClientRect().top; return Math.max(...[...bd.querySelectorAll('*')].map(e => e.getBoundingClientRect().bottom)) > top - 2 ? i + 1 : null; }).filter(Boolean));
  check('development summary: nothing runs into a page footer', dover.length === 0, dover.join(','));
  /* short and long holds: the right number of pages, and nothing clipped, overflowing or running into a footer */
  for (const [nm, d, pages] of [['2-year hold', Object.assign({}, require(path.join(__dirname, 'dealB.js')), { holdYears: 2 }), 7], ['15-year hold', Object.assign({}, require(path.join(__dirname, 'dealB.js')), { holdYears: 15 }), 9],
    ['development, 15-year hold', Object.assign({}, require(path.join(__dirname, 'devdeal.js')), { holdYears: 15 }), 8], ['development, 4-year hold', Object.assign({}, require(path.join(__dirname, 'devdeal.js')), { holdYears: 4 }), 7]]) {
    const html = await p.evaluate(d => { bkCreateNewDeal(d); return bkReportHTML(); }, d); await doc.setContent(html); await doc.waitForTimeout(300);
    const r = await doc.evaluate(() => { const P = [...document.querySelectorAll('.page')];
      return { n: P.length, over: P.map((s, i) => { const ft = s.querySelector('.ft2'), bd = s.querySelector('.bd'); if (!ft || !bd) return null; return Math.max(...[...bd.querySelectorAll('*')].map(e => e.getBoundingClientRect().bottom)) > ft.getBoundingClientRect().top - 2 ? i + 1 : null; }).filter(Boolean),
        wide: P.map((s, i) => [...s.querySelectorAll('*')].some(e => e.getBoundingClientRect().right > s.getBoundingClientRect().right + 1) ? i + 1 : null).filter(Boolean),
        clip: [...document.querySelectorAll('td,th')].filter(e => e.scrollWidth > e.clientWidth + 1 && e.innerText.trim()).length, nan: /NaN|undefined|Infinity/.test(document.body.innerText),
        numbered: P.slice(1).every((s, i) => new RegExp('Page ' + (i + 2) + ' of ' + P.length).test(s.innerText)) }; });
    check(nm + ': ' + pages + ' pages, numbered in order', r.n === pages && r.numbered, r.n);
    check(nm + ': nothing overflows, is clipped or runs into a footer', !r.over.length && !r.wide.length && !r.clip && !r.nan, JSON.stringify(r));
  }
  check('no page errors', errs.length === 0, errs.join(' | '));
  await b.close(); console.log(`${checks} checks, ${fails} failures`); process.exit(fails ? 1 : 0);
})();
