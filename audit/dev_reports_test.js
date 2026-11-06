// Reports for a development deal (src/156): the Sources and Uses Report by year and the Valuation Report (Development Valuation and Return Summary), in Argus's layout.
// Every line is checked against the engines read independently of the report (the funding months of bkDevFundingV10, the monthly returns rows, the takeout bkDevTakeoutV11, the shared
// funding summary and the analysis registry), on eleven development variants: sources equal uses in every year, the costs are the Development Cash Flow's own lines, the equity rows add to
// the capital measures, the permanent loan and the construction loan it retires sit in the takeout year, and the valuation panels are the figures the other pages show.
//   node audit/dev_reports_test.js index.html
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); const path = require('path');
const V = require(path.join(__dirname, 'devdeal.js')), H = require(path.join(__dirname, 'harbor', 'deal.js'));
const IR = (a) => [{ name: 'Interest reserve', amount: a, at: 'close', use: 'interest' }], OR = (a) => [{ name: 'Operating reserve', amount: a, at: 'close', use: 'operating' }];
const VARIANTS = [['audit development deal', V, {}], ['Harbor Point', H, {}], ['3-year hold (sale before the takeout)', V, { holdYears: 3 }], ['10-year hold', V, { holdYears: 10 }], ['no construction loan', V, { conLTC: 0, conLTV: 0 }],
  ['heavy capitalized interest', V, { conLTC: 0.85, conUtil: 0.9, conRate: 0.10 }], ['30% vacancy + operating reserve', V, { vacancy: 0.3, initReserves: OR(200000) }], ['interest reserve + refinance at stabilization', V, { initReserves: IR(1e6), refiAtStab: 1, gpShare: 0.2 }],
  ['fixed facility + equity first + lease-up 24', V, { conFixedAmt: 18e6, conCeiling: 24e6, conEquityFirst: 8e6, refiAtStab: 1, leaseupMonths: 24 }], ['operating + interest reserves + fixed facility', V, { initReserves: [].concat(IR(1e6), OR(300000)), conFixedAmt: 18e6, conCeiling: 24e6, refiAtStab: 1 }],
  ['equity first + unused fee', V, { conEquityFirst: 1e7, conUnusedFeePct: 0.005 }]];
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  let checks = 0, fails = 0; const check = (n, ok, d) => { checks++; if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? '  [' + String(d).slice(0, 420) + ']' : '')); };
  const open = async (deal, over, w) => { const p = await (await b.newContext({ viewport: { width: w || 1440, height: 1000 } })).newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
    await p.route(/supabase\.co|vercel\.app|fonts\.g|cdn\.jsdelivr/, r => r.abort()); await p.goto('file://' + path.resolve(process.argv[2])); await p.waitForTimeout(700);
    await p.evaluate(([d, o]) => { document.documentElement.classList.add('bk-auth-ok'); bkCreateNewDeal(d); const s = bkLoad(); Object.assign(s, d, o || {}); bkSave(s); }, [deal, over]); return p; };
  const near = (a, c, tol) => a != null && c != null && Math.abs(a - c) <= (tol == null ? 1 : tol);
  const sameArr = (x, y, tol) => x.length === y.length && x.every((v, i) => near(v, y[i], tol));

  /* the report as text, and the engines read independently of it */
  const READ = (p) => p.evaluate(async () => {
    const num = (t) => { t = String(t).trim(); if (t === '' || t === '-') return null; const neg = /^\(.*\)$/.test(t); const v = parseFloat(t.replace(/[(),%$x]/g, '')); return neg ? -v : v; };
    const table = (id) => { const rows = {}, order = [], cls = {}; let sec = ''; [...document.querySelectorAll('#' + id + ' tbody tr')].forEach(tr => { const c = [...tr.children].map(td => td.textContent.trim()); if (tr.classList.contains('sec')) { sec = c[0]; order.push('#' + sec); return; } rows[c[0]] = c.slice(1).map(num); cls[c[0]] = tr.className; order.push(c[0]); }); return { rows, order, cls }; };
    showSheet('Sources and Uses Report'); await new Promise(r => setTimeout(r, 500));
    const su = table('rp-su'), suText = document.querySelector('#viewport').innerText, suHead = (document.querySelector('#viewport .rp-head .rp-t') || {}).textContent, years = document.querySelectorAll('#rp-su thead tr:not(.rp-fc):not(.rp-pe) th.r').length - 1;
    const pe = [...document.querySelectorAll('#rp-su thead tr.rp-pe th')].map(x => x.textContent.trim());
    showSheet('Cash Flow Report'); await new Promise(r => setTimeout(r, 400)); const cf = table('rp-devcf');
    showSheet('Valuation Report'); await new Promise(r => setTimeout(r, 400));
    const val = {}; [...document.querySelectorAll('#viewport .rp .rp-tbl tbody tr')].forEach(tr => { const t = tr.closest('table').id; val[t] = val[t] || {}; val[t][tr.cells[0].textContent.trim()] = tr.cells[1] ? tr.cells[1].textContent.trim() : ''; });
    const valSec = [...document.querySelectorAll('#viewport .rp .rp-sec')].map(x => x.textContent.trim()), valText = document.querySelector('#viewport').innerText;
    /* the engines */
    const s = bkLoad(), f = bkDevFundingV10(), mr = bkMonthlyReturns(), tk = bkDevTakeoutV11(), fs = bkFundingSummary(), rows = mr.rows, n = Math.ceil(rows.length / 12), z = (v) => Number(v) || 0;
    const Fm = (k) => { const o = new Array(n).fill(0); f.months.forEach(m => { const y = Math.ceil(m.mo / 12); if (y >= 1 && y <= n) o[y - 1] += z(m[k]); }); return o; }, Rm = (k) => { const o = new Array(n).fill(0); rows.forEach(r => { o[r.y - 1] += z(r[k]); }); return o; };
    const sm = BKReg.summarize(s), met = (id) => (sm.metrics.concat([sm.primary]).find(m => m && m.id === id) || {}).value;
    const meas = {}; ['closingEquity', 'totalContributedEquity', 'operatingCashRequirement', 'totalProjectCapitalization'].forEach(k => { meas[k] = { name: fs.measures[k].name, amount: fs.measures[k].amount }; });
    return { su, suText, suHead, years, pe, cf, val, valSec, valText, n,
      eng: { noi: Rm('noi'), draw: Fm('loanDraw'), capI: Fm('capInt'), land: Fm('land'), hard: Fm('hard'), soft: Fm('soft'), wfC: Rm('wfContrib'), wfD: Rm('wfDist'), eqD: Rm('equityDraw'), payoff: Rm('payoff'), ds: Rm('ds'), gross: Rm('grossSale'), sale: Rm('sale'), dispo: Rm('dispoFee'),
        tk: { inHold: !!tk.takeoutInHold, perm: z(tk.permLoan), fee: z(tk.permFee), con: z(tk.conPayoff), stab: z(tk.stab) }, meas, irr: mr.irr, uirr: (mr.u || {}).irr, met: { devCost: met('devCost'), capitalization: met('capitalization'), stabNOI: met('stabNOI'), yieldOnCost: met('yieldOnCost'), stabValue: met('stabValue'), devSpread: met('devSpread') } } }; });

  const SRC = ['Net Operating Income', 'Construction Loan Draws', 'Interest Capitalized into the Loan', 'Permanent Loan Proceeds', 'Reserve Draws during Development', 'Operating Reserve Applied and Released', 'Net Proceeds From Sale'];
  const USE = ['Land and Acquisition', 'Hard Costs', 'Soft Costs', 'Lease-Up Operating Deficit', 'Financing Fees', 'Reserves Funded', 'Construction Interest Capitalized', 'Construction Interest Paid in Cash', 'Construction Loan Retired at Takeout', 'Permanent Loan Fees', 'Total Debt Service', 'Leasing Capital', 'Asset Management Fee', 'Disposition Fee', 'Debt Retirement at Sale'];
  const $ = (v) => (v < 0 ? '($' : '$') + Math.round(Math.abs(v)).toLocaleString('en-US') + (v < 0 ? ')' : '');
  const results = [];
  for (const [tag, deal, over] of VARIANTS) {
    const p = await open(deal, over); const R = await READ(p), E = R.eng, n = R.n, r = (k) => R.su.rows[k] || null, yr = (k) => (r(k) || new Array(n + 1).fill(0)).slice(0, n), tot = (k) => (r(k) || [])[n];
    const zeros = new Array(n).fill(0), sumOf = (ks) => ks.reduce((a, k) => a.map((v, i) => v + yr(k)[i]), zeros.slice());
    const ty = E.tk.inHold && E.tk.perm > 0 ? Math.ceil(E.tk.stab / 12) : 0, at = (v) => zeros.map((x, i) => (i + 1 === ty ? v : 0));
    const o = { tag, errs: p.errs.slice() };
    o.table = !!r('Total Sources of Capital') && !!r('Total Uses of Capital') && R.years === n && R.pe.length === n + 2 && R.suHead === 'Development Sources and Uses' && !r('Property Purchase Price') && !/stabilized, operating properties/.test(R.suText);
    o.balance = sameArr(yr('Total Sources of Capital'), yr('Total Uses of Capital'), 1) && yr('Total Sources less Total Uses').every(v => v === 0) && !/rp-bad/.test(R.su.cls['Total Sources less Total Uses'] || '');
    o.sums = sameArr(yr('Defined Sources of Capital'), sumOf(SRC), SRC.length) && sameArr(yr('Total Sources of Capital'), sumOf(['Defined Sources of Capital', 'Initial Equity Contribution', 'Required Equity Contributions']), 3)
      && sameArr(yr('Defined Uses of Capital'), sumOf(USE), USE.length) && sameArr(yr('Total Uses of Capital'), sumOf(['Defined Uses of Capital', 'Cash Flow Distributions']), 2);
    o.engine = sameArr(yr('Net Operating Income'), E.noi, 1) && sameArr(yr('Construction Loan Draws'), E.draw, 1) && sameArr(yr('Interest Capitalized into the Loan'), E.capI, 1) && sameArr(yr('Construction Interest Capitalized'), E.capI, 1)
      && sameArr(yr('Land and Acquisition'), E.land, 1) && sameArr(yr('Hard Costs'), E.hard, 1) && sameArr(yr('Soft Costs'), E.soft, 1) && sameArr(yr('Cash Flow Distributions'), E.wfD, 1) && sameArr(yr('Debt Retirement at Sale'), E.payoff, 1) && sameArr(yr('Total Debt Service'), E.ds, 1)
      && sameArr(yr('Net Proceeds From Sale'), E.sale, 1) && sameArr(yr('Disposition Fee'), E.dispo, 1) && sameArr(yr('Initial Equity Contribution'), E.eqD, 1) && sameArr(yr('Required Equity Contributions'), E.wfC.map((v, i) => v - E.eqD[i]), 1);
    o.takeout = sameArr(yr('Permanent Loan Proceeds'), at(E.tk.perm), 1) && sameArr(yr('Construction Loan Retired at Takeout'), at(E.tk.con), 1) && sameArr(yr('Permanent Loan Fees'), at(E.tk.fee), 1) && (ty ? !!r('Permanent Loan Proceeds') : !r('Permanent Loan Proceeds') && !r('Construction Loan Retired at Takeout'));
    o.measures = near(tot('Initial Equity Contribution'), E.meas.closingEquity.amount, 1) && near(tot('Initial Equity Contribution') + (tot('Required Equity Contributions') || 0), E.meas.totalContributedEquity.amount, 2);
    const cfRow = (k) => (R.cf.rows[k] || new Array(n + 1).fill(0)).slice(0, n);   /* a line the cash flow report leaves out is zero in every year */
    o.cfTie = USE.slice(0, 8).every(k => !r(k) || sameArr(yr(k), cfRow(k), 0)) && sameArr(yr('Net Proceeds From Sale'), cfRow('Net Sales Price'), 0) && sameArr(yr('Net Operating Income'), cfRow('Net Operating Income'), 0) && sameArr(yr('Construction Loan Draws'), cfRow('Construction Loan Draws'), 0);
    o.zero = R.su.order.filter(k => k[0] !== '#' && !/\b(sub|tot|dim)\b/.test(R.su.cls[k] || '')).every(k => yr(k).some(v => v !== 0) || /^IRR/.test(k)) && SRC.concat(USE).every(k => r(k) || true);
    o.irr = R.su.rows['IRR (Leveraged)'] && near(R.su.rows['IRR (Leveraged)'][n - 1], Math.round(E.irr * 10000) / 100, 0.006) && near(R.su.rows['IRR (Unleveraged)'][n - 1], Math.round(E.uirr * 10000) / 100, 0.006);
    /* the valuation report */
    const V0 = R.val['rp-val0'] || {}, VY = R.val['rp-val1'] || {}, VB = R.val['rp-val2'] || {}, VD = R.val['rp-val4'] || {}, VC = R.val['rp-val3'] || {}, sumA = (a) => a.reduce((t, v) => t + v, 0), cfTot = (k) => (R.cf.rows[k] || new Array(n + 1).fill(0))[n];
    o.valPanels = R.valSec.join('|') === 'Valuation Assumptions|Development Yield|Sales Proceeds Calculation|Distributions of Net Proceeds|Return Summary' && /Development Valuation and Return Summary/.test(R.valText) && !/A development is valued from/.test(R.valText) && !/NaN|undefined|Infinity/.test(R.valText);
    o.valYield = VY['Total Development Cost (before financing)'] === $(E.met.devCost) && VY['Total Capitalization (incl. financing)'] === $(E.met.capitalization) && VY['Stabilized NOI'] === $(E.met.stabNOI) && VY['Yield on Cost'] === (E.met.yieldOnCost * 100).toFixed(2) + '%'
      && VY['Stabilized Value'] === $(E.met.stabValue) && VY['Development Spread'] === (E.met.devSpread < 0 ? '(' + Math.round(-E.met.devSpread).toLocaleString('en-US') + ')' : Math.round(E.met.devSpread).toLocaleString('en-US')) + ' bps';   /* a negative spread in parentheses, as every negative figure */
    o.valSale = VB['Gross Sale Price'] === $(sumA(E.gross)) && VB['Net Sales Price'] === $(cfTot('Net Sales Price')) && VD['Proceeds from Sale'] === $(cfTot('Proceeds from Sale')) && VD['Less: Loan Payoff'] === $(cfTot('Loan Payoff')) && VD['Less: Disposition Fee'] === $(cfTot('Disposition Fee'));
    o.valReturns = VC['IRR (Leveraged)'] === (E.irr * 100).toFixed(2) + '%' && VC['IRR (Unleveraged)'] === (E.uirr * 100).toFixed(2) + '%' && Object.keys(E.meas).every(k => VC[E.meas[k].name] === $(E.meas[k].amount)) && E.meas.closingEquity.name === 'Initial funding equity';
    o.valTakeout = ty ? V0['Permanent Loan (Takeout)'] === $(E.tk.perm) : V0['Permanent Loan (Takeout)'] === 'None in the hold';
    o.detail = JSON.stringify({ ty, n, cfSale: ['Net Sales Price', 'Proceeds from Sale', 'Loan Payoff', 'Disposition Fee'].map(k => [k, cfTot(k)]), rows: Object.keys(R.su.rows).length, d: yr('Total Sources less Total Uses'), V0: V0['Permanent Loan (Takeout)'], VY, VB, VD, C: Object.keys(E.meas).map(k => [VC[E.meas[k].name], E.meas[k].amount]) });
    results.push(o); await p.close();
  }
  const all = (k, label) => { const bad = results.filter(o => !o[k]); check(label + ' (' + results.length + ' development variants' + (bad.length ? '; fails on: ' + bad.map(o => o.tag).join(', ') : '') + ')', bad.length === 0, bad.length ? bad[0].detail : undefined); };
  all('table', 'a development deal gets its own Sources and Uses Report by year: Development Sources and Uses, with the year and period-ending rows, and none of the operating-property lines or the old "operating properties" note');
  all('balance', 'Total Sources of Capital equals Total Uses of Capital in every year, and the difference row reads $0 in every year (it is computed, not a plug, and is not marked)');
  all('sums', 'Defined Sources, Total Sources, Defined Uses and Total Uses are the sums of the lines shown above them, year by year');
  all('engine', 'every line is the engine\'s own series summed by year: NOI, loan draws and capitalized interest, land, hard and soft costs, debt service, the sale, the disposition fee, the loan retired at the sale, distributions, and the equity split into the development draws and the capital called after them');
  all('takeout', 'the permanent loan, its fee and the construction loan it retires are the takeout\'s own figures, in the takeout year only; with no takeout in the hold none of the three lines shows');
  all('measures', 'Initial Equity Contribution adds up to Initial funding equity, and with Required Equity Contributions to Total contributed equity (the shared funding summary\'s measures)');
  all('cfTie', 'the development cost lines, NOI, the loan draws and the net sales price are the Development Cash Flow report\'s own lines, figure for figure');
  all('zero', 'a line that is zero in every year is left out; every line shown has a figure');
  all('irr', 'the Annual IRR rows are the returns engine\'s unleveraged and leveraged IRRs, in the final year');
  all('valPanels', 'the Valuation Report on a development is the Development Valuation and Return Summary in five Argus panels, with no stub and no NaN');
  all('valYield', 'Development Yield is the analysis registry\'s own figures (the ones the Overview and the Snapshot show): cost, capitalization, stabilized NOI, yield on cost, spread and stabilized value');
  all('valSale', 'the sale and its distribution are the Development Cash Flow\'s own totals (gross sale, net sales price, disposition fee, loan payoff, proceeds from sale)');
  all('valReturns', 'Return Summary shows the engine\'s IRRs and the four capital measures by their development names, each with the shared funding summary\'s amount');
  all('valTakeout', 'Valuation Assumptions names the permanent loan the takeout sizes, or "None in the hold" when the sale comes first');
  check('no page errors on any variant', results.every(o => o.errs.length === 0), results.filter(o => o.errs.length).map(o => o.tag + ': ' + o.errs[0]).join(' | '));
  /* phone */
  const p = await open(V, {}, 390); const ph = await p.evaluate(async () => { const out = {}; for (const sh of ['Sources and Uses Report', 'Valuation Report']) { showSheet(sh); await new Promise(r => setTimeout(r, 500)); out[sh] = document.documentElement.scrollWidth - document.documentElement.clientWidth; } return out; });
  check('phone: neither page scrolls sideways (the year table scrolls inside its own box)', Object.values(ph).every(v => v <= 1), JSON.stringify(ph)); await p.close();
  console.log(checks + ' checks, ' + fails + ' failures'); await b.close(); process.exit(fails ? 1 : 0);
})();
