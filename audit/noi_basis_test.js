// One NOI basis for every debt test, and one for the exit (owner's decision, November 2026). The loan sizing uses the deal's lender basis (lenderNoiBasis: NOI before capital
// reserves unless set to after); every DSCR and debt yield the app, the guide, the reports and the investor PDF show must use the same NOI and name it. The exit prices the
// next 12 months' NOI on its own stated basis (exitNoiBasis), and every place that prints it says which.
// Checked with both lender settings on a deal where the DSCR binds the loan and on one where loan-to-value binds (there the two bases give different coverage).
//   node audit/noi_basis_test.js index.html
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); const path = require('path');
const A = require(path.join(__dirname, 'deal.js'));
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  let checks = 0, fails = 0; const check = (n, ok, d) => { checks++; if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? '  [' + String(d).slice(0, 420) + ']' : '')); };
  const p = await b.newPage({ viewport: { width: 1400, height: 900 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route(/supabase\.co|vercel\.app|fonts\.g|cdn\.jsdelivr/, r => r.abort()); await p.goto('file://' + path.resolve(process.argv[2])); await p.waitForTimeout(700);
  const x2 = (v) => (Math.round(v * 100) / 100).toFixed(2) + 'x';
  const READ = (over) => p.evaluate(async ([d, over]) => { document.documentElement.classList.add('bk-auth-ok'); bkCreateNewDeal(d); const s = bkLoad(); Object.assign(s, d, over); bkSave(s);
    const wait = (ms) => new Promise(r => setTimeout(r, ms)), dd = bkDebt(), c = bkCalc(), u = bkAnnualCF(), K = bkProFormaKit.build(), basis = bkLenderNoiBasis(), label = bkNoiBasisLabel('dscr');
    const out = { basis, label, binding: dd.binding, dscr: dd.dscr, dscrNoi: dd.dscrNoi, calcNoi: c.noi, calcAfter: c.after, n: u.arr.length,
      want: u.arr.map((a, i) => { const pay = (dd.annual[i] || {}).payment || 0; return pay ? bkLenderNoi(a) / pay : null; }), kit: K.Y.map(r => r.dscr), terminal: u.terminalNOI, exitLabel: bkNoiBasisLabel('exit') };
    /* investor PDF: the coverage row's label and figures, and the exit NOI line */
    const html = bkReportHTML(), doc = new DOMParser().parseFromString(html, 'text/html');
    const row = [...doc.querySelectorAll('tr')].find(tr => /^Lender DSCR \(/.test((tr.cells[0] || {}).textContent || '')); out.short = bkNoiBasisLabel('dscr', null, true);
    out.pdfLabel = row ? row.cells[0].textContent : null; out.pdf = row ? [...row.cells].slice(1).map(td => td.textContent.trim()).filter(Boolean) : [];
    const dy = [...doc.querySelectorAll('tr')].find(tr => /^Debt yield/.test((tr.cells[0] || {}).textContent || '')); out.pdfDyLabel = dy ? dy.cells[0].textContent : null;
    const ex = [...doc.querySelectorAll('tr')].find(tr => /^NOI to capitalize/.test((tr.cells[0] || {}).textContent || '')); out.pdfExit = ex ? [ex.cells[0].textContent, ex.cells[1].textContent] : null;
    /* screens */
    showSheet('Property CF'); await wait(400); const sv = document.querySelector('#viewport .pf-card svg'); out.chart = sv ? [...sv.querySelectorAll('text')].map(t => t.textContent).filter(t => /^\d+\.\d\dx$/.test(t)) : []; out.chartCap = (document.querySelector('#viewport .pf-card .s') || {}).textContent || '';
    showSheet('Covenant Monitor'); await wait(400); const ct = [...document.querySelectorAll('#viewport table')].find(t => /^Line Item/.test(((t.querySelector('tr') || {}).textContent || '').trim()));
    const crow = (re) => { const tr = ct ? [...ct.querySelectorAll('tr')].find(r => re.test((r.cells[0] || {}).textContent || '')) : null; return tr ? [...tr.cells].map(c => c.textContent.trim()) : []; };
    out.cov = crow(/^Lender DSCR \(min/).slice(1); const nr = crow(/capital reserves \(lender basis\)$/i); out.covNoiLabel = nr[0] || null; out.covNoi = nr.slice(1).map(t => Number(t.replace(/[^0-9.\-]/g, '')) * (/^\(/.test(t) ? -1 : 1));
    out.lenderNoi = u.arr.map(a => Math.round(bkLenderNoi(a)));
    showSheet('Home'); await wait(400); const tile = [...document.querySelectorAll('.pl-kpi')].find(k => /DSCR/.test(k.querySelector('.k').textContent)); out.home = tile ? tile.querySelector('.v').textContent.trim() : null;
    showSheet('Valuation Report'); await wait(400); const vr = [...document.querySelectorAll('#viewport .rp-tbl tr')].find(tr => (tr.cells[0] || {}).textContent === 'NOI To Capitalize'); out.valExit = vr ? [vr.cells[1].textContent, vr.cells[2].textContent] : null;
    /* the guide: the financing step and the review */
    bkGuideOn(); bkGuideGo('debt'); await wait(400); out.gFin = ((document.querySelector('#viewport .gd-res') || {}).innerText || '').replace(/\s+/g, ' '); out.gFinTitle = [...document.querySelectorAll('#viewport .gd-res span')].map(e => e.title).join(' ');
    bkGuideGo('review'); await wait(400); out.gRev = ((document.querySelector('#viewport .gd-res') || {}).innerText || '').replace(/\s+/g, ' '); bkGuideOff(); await wait(200);
    out.lbasis = bkDscrBasis('lender'); const cap = bkDebtCapacity(); out.house = cap && cap.box ? cap.box.dscr : null; out.houseMin = cap ? cap.policy.minDSCR : null;
    return out; }, [A, over]);

  const runs = {};
  for (const [tag, over] of [['DSCR binds, before reserves', {}], ['DSCR binds, after reserves', { lenderNoiBasis: 'after' }], ['LTV binds, before reserves', { acqLTV: 0.5 }], ['LTV binds, after reserves', { acqLTV: 0.5, lenderNoiBasis: 'after' }]]) {
    const r = await READ(over); runs[tag] = r; const y1 = x2(r.want[0]);
    check(tag + ': the loan sizing uses the deal\'s lender NOI (' + r.label + ')', Math.abs(r.dscrNoi - (r.basis === 'after' ? r.calcAfter : r.calcNoi)) < 1, JSON.stringify([r.basis, r.dscrNoi, r.calcNoi, r.calcAfter]));
    check(tag + ': the pro forma\'s coverage in every year is that NOI over the year\'s debt service', r.kit.length === r.n && r.kit.every((v, i) => r.want[i] == null ? v == null : Math.abs(v - r.want[i]) < 1e-9), JSON.stringify([r.kit.slice(0, 3), r.want.slice(0, 3)]));
    check(tag + ': the investor PDF\'s coverage row names the basis and prints the same figure in every year', r.pdfLabel === 'Lender DSCR (' + r.short + ')' && r.pdf.length >= 5 && r.pdf.slice(0, Math.min(5, r.n)).every((t, i) => t === x2(r.want[i])) && r.pdfDyLabel === 'Debt yield (' + r.short + ')', JSON.stringify([r.pdfLabel, r.pdf.slice(0, 5), r.want.slice(0, 5).map(x2), r.pdfDyLabel]));
    check(tag + ': Property CF\'s coverage chart prints the same Year 1 figure and its caption names the basis', r.chart[0] === y1 && r.chartCap.indexOf(r.label) >= 0, JSON.stringify([r.chart.slice(0, 2), y1, r.chartCap.slice(0, 90)]));
    check(tag + ': the Covenant Monitor tests every year on the same DSCR, and its NOI row is the lender NOI under the basis name (it printed "NOI After Reserves" whatever the basis)', r.cov.length === r.n && r.cov.every((t, i) => r.want[i] == null || t === x2(r.want[i])) && !!r.covNoiLabel && r.covNoiLabel.toLowerCase().indexOf(r.label.toLowerCase()) === 0 && r.covNoi.every((v, i) => Math.abs(v - r.lenderNoi[i]) <= 1), JSON.stringify([r.cov.slice(0, 3), r.want.slice(0, 3).map(x2), r.covNoiLabel, r.covNoi.slice(0, 2), r.lenderNoi.slice(0, 2)]));
    check(tag + ': the guide shows the engine\'s DSCR as the lender DSCR, the same figure on the financing step and on the review, with its basis named, and so does the Overview tile', r.gFin.indexOf('Lender DSCR ' + x2(r.dscr)) >= 0 && r.gRev.indexOf('Lender DSCR ' + x2(r.dscr) + ' (' + r.lbasis + ')') >= 0 && r.gFinTitle.indexOf(r.lbasis) >= 0 && r.home === x2(r.dscr), JSON.stringify([r.gFin.slice(0, 80), r.gRev.slice(0, 120), r.home, x2(r.dscr)]));
    check(tag + ': the guide distinguishes the two: beside the lender DSCR it shows the house DSCR (NOI after reserves) the credit policy tests, the same figure as Debt Capacity\'s credit box, on both screens, with the house minimum on the review', r.house != null && r.gFin.indexOf('House DSCR ' + x2(r.house)) >= 0 && r.gRev.indexOf('House DSCR ' + x2(r.house) + ' (NOI after reserves; minimum ' + x2(r.houseMin) + ')') >= 0, JSON.stringify([r.house, r.gFin.slice(0, 120), r.gRev.slice(0, 200)]));
    check(tag + ': the going-in DSCR the sizing reports and the Year 1 DSCR of the cash flow are the same NOI over the same year-1 debt service', Math.abs(r.dscr - r.want[0]) < 0.0005, JSON.stringify([r.dscr, r.want[0]]));
  }
  const lb = runs['LTV binds, before reserves'], la = runs['LTV binds, after reserves'];
  check('where loan-to-value binds (the same loan either way), switching the lender basis to after reserves lowers every coverage figure together: the engine, the pro forma, the PDF, the chart, the covenants and the guide', la.dscr < lb.dscr - 0.01 && la.kit[0] < lb.kit[0] - 0.01 && la.pdf[0] !== lb.pdf[0] && la.chart[0] !== lb.chart[0] && la.cov[0] !== lb.cov[0] && la.gRev !== lb.gRev, JSON.stringify([lb.dscr, la.dscr, lb.pdf[0], la.pdf[0]]));
  /* the exit */
  for (const [tag, over] of [['exit on NOI after reserves (the default)', {}], ['exit on NOI before reserves', { exitNoiBasis: 'before' }]]) {
    const r = await READ(over), money = '$' + Math.round(r.terminal).toLocaleString('en-US'), word = /before/.test(r.exitLabel) ? 'before' : 'after';
    check(tag + ': the PDF and the Valuation Report both price the sale on the engine\'s next-12-months NOI and say which basis', !!r.pdfExit && /next 12 months/.test(r.pdfExit[0]) && r.pdfExit[0].indexOf(word + ' reserves') >= 0 && r.pdfExit[1] === money && !!r.valExit && r.valExit[0] === money && r.valExit[1].indexOf(word + ' capital reserves') >= 0, JSON.stringify([r.pdfExit, r.valExit, money]));
  }
  check('no page errors', errs.length === 0, errs.slice(0, 2).join(' | '));
  console.log(checks + ' checks, ' + fails + ' failures'); await b.close(); process.exit(fails ? 1 : 0);
})();
