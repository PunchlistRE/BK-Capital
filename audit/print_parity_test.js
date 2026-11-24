/* PRINT PARITY (design-system phase 1). Phase 1 changes the screen only. This prints the same outputs as the PDF regression (the investor PDF, the waterfall summary
   and the browser print of the key sheets) from the reference build and from this build, on this machine, and requires them to match: the same number of pages,
   the same words on every page, and the same picture of every page (no pixel differs at 60 dpi). Read-only.   node audit/print_parity_test.js ref.html index.html
   Needs pdftotext, pdfinfo and pdftoppm (poppler). */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); const fs = require('fs'), path = require('path'), cp = require('child_process'), os = require('os');
const A = require(path.join(__dirname, 'deal.js')), V = require(path.join(__dirname, 'devdeal.js'));
const REF = path.resolve(process.argv[2]), CUR = path.resolve(process.argv[3] || 'index.html'), FIXED = Date.UTC(2026, 10, 13, 12, 0, 0);
let checks = 0, fails = 0; const check = (n, ok, d) => { checks++; if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? '  [' + String(d).slice(0, 300) + ']' : '')); };
const OUTS = [{ id: 'investor-acq-7y', kind: 'investor', deck: A, hold: 7 }, { id: 'investor-dev', kind: 'investor', deck: V, hold: 0 }, { id: 'waterfall-summary-acq', kind: 'waterfall', deck: A, hold: 7 },
  ...['Debt', 'Depreciation', 'Credit Policy', 'Property CF', 'Cash Flow Report', 'Sources and Uses Report', 'Waterfall Report', 'Valuation Report'].map(s => ({ id: 'sheet-' + s.toLowerCase().replace(/[^a-z0-9]+/g, '-'), kind: 'sheet', sheet: s, deck: A, hold: 7 }))];
/* the one approved change to a printed page in phase 1: Credit Policy groups its settings under six headings (the owner's decision). Every setting, value, default and status must still print. */
const EXPECTED = { 'sheet-credit-policy': { why: 'settings grouped (approved)', added: ['Return targets', 'Debt limits', 'Market and development tests', 'Risk tolerance', 'Approval thresholds', 'Stress tests'] } };
const sh = (c, a) => cp.spawnSync(c, a, { encoding: 'latin1', maxBuffer: 1 << 28 });
async function print(b, html, o, f) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }), p = await ctx.newPage();
  await p.route(/supabase\.co|vercel\.app|fonts\.g|cdn\.jsdelivr/, r => r.abort());
  await p.addInitScript(F => { const D = Date; class FD extends D { constructor(...a) { if (a.length) super(...a); else super(F); } static now() { return F; } } window.Date = FD; }, FIXED);
  await p.goto('file://' + html); await p.waitForTimeout(700);
  await p.evaluate(([d, h]) => { document.documentElement.classList.add('bk-auth-ok'); bkCreateNewDeal(Object.assign({}, d, h ? { holdYears: h } : {})); }, [o.deck, o.hold]); await p.waitForTimeout(600);
  if (o.kind === 'sheet') { await p.evaluate(s => showSheet(s), o.sheet); await p.waitForTimeout(1500); await p.evaluate(() => window.dispatchEvent(new Event('beforeprint'))); await p.emulateMedia({ media: 'print' }); await p.waitForTimeout(300); await p.pdf({ path: f, format: 'Letter', printBackground: true, preferCSSPageSize: true }); }
  else { const h = await p.evaluate(k => k === 'waterfall' ? bkWaterfallSummaryHTML() : bkReportHTML(), o.kind); const ip = await ctx.newPage(); await ip.setContent(h, { waitUntil: 'load' }); await ip.waitForTimeout(500); await ip.pdf({ path: f, preferCSSPageSize: true, printBackground: true }); }
  await ctx.close();
}
function pages(f, dir) { fs.mkdirSync(dir, { recursive: true }); sh('pdftoppm', ['-r', '60', '-gray', f, path.join(dir, 'p')]); return fs.readdirSync(dir).filter(x => /\.pgm$/.test(x)).sort().map(x => fs.readFileSync(path.join(dir, x))); }
(async () => { const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined }); const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-'));
  for (const o of OUTS) { const fa = path.join(tmp, o.id + '-ref.pdf'), fb = path.join(tmp, o.id + '-cur.pdf');
    await print(b, REF, o, fa); await print(b, CUR, o, fb);
    const na = +(/Pages:\s+(\d+)/.exec(sh('pdfinfo', [fa]).stdout) || [])[1], nb = +(/Pages:\s+(\d+)/.exec(sh('pdfinfo', [fb]).stdout) || [])[1];
    const ta = sh('pdftotext', ['-layout', fa, '-']).stdout, tb = sh('pdftotext', ['-layout', fb, '-']).stdout;
    const pa = pages(fa, path.join(tmp, o.id + '-a')), pb = pages(fb, path.join(tmp, o.id + '-b')); let px = 0, worst = '';
    pa.forEach((x, i) => { const y = pb[i]; if (!y || x.length !== y.length) { px++; worst = 'page ' + (i + 1) + ' size'; return; } let d = 0; for (let k = 0; k < x.length; k++) if (x[k] !== y[k]) d++; if (d) { px++; worst = worst || ('page ' + (i + 1) + ': ' + d + ' bytes'); } });
    let firstDiff = ''; if (ta !== tb) { const la = ta.split('\n'), lb = tb.split('\n'); const k = la.findIndex((l, i) => l !== lb[i]); firstDiff = 'line ' + (k + 1) + ': "' + (la[k] || '').trim().slice(0, 80) + '" vs "' + (lb[k] || '').trim().slice(0, 80) + '"'; }
    if (EXPECTED[o.id]) { const e = EXPECTED[o.id], words = x => x.split('\n').filter(l => !/Punchlist Capital/.test(l)).join(' ').toLowerCase().split(/\s+/).filter(Boolean), wa = words(ta), wb = words(tb), extra = e.added.join(' ').toLowerCase().split(/\s+/).filter(Boolean);   /* page headers and footers repeat per page; headings print in capitals */
      const cnt = l => l.reduce((m, w) => (m[w] = (m[w] || 0) + 1, m), {}), ca = cnt(wa), cb = cnt(wb); extra.forEach(w => { cb[w] = (cb[w] || 0) - 1; });
      const lost = Object.keys(ca).filter(w => (cb[w] || 0) < ca[w]), gained = Object.keys(cb).filter(w => cb[w] > (ca[w] || 0));
      check(o.id + ': ' + e.why + ': every word and figure still printed, only ' + e.added.length + ' group headings added (' + na + ' -> ' + nb + ' pages)', lost.length === 0 && gained.length === 0 && nb - na <= 1, 'missing: ' + lost.slice(0, 6).join(' ') + ' ; unexpected: ' + gained.slice(0, 6).join(' ')); continue; }
    check(o.id + ': same pages (' + na + '), same words, same picture of every page', na === nb && ta === tb && px === 0, (na !== nb ? 'pages ' + na + ' vs ' + nb + ' ; ' : '') + firstDiff + (px ? ' ; pixels differ on ' + px + ' page(s), first ' + worst : '')); }
  fs.rmSync(tmp, { recursive: true, force: true }); console.log('print parity: ' + checks + ' checks, ' + fails + ' failures'); await b.close(); process.exit(fails ? 1 : 0); })();
