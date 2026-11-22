/* PROPERTY CF PRINT (audit item 1). The Property CF page prints as a statement: every table at one type size, the monthly detail laid out months across
   (line items down, one block of months per table, as an ARGUS cash-flow report does), no near-blank page, nothing running past the right margin.
   Read-only: nothing here changes the app, a calculation or deal data. The monthly figures on paper are checked against the figures on screen, cell by cell.
   Needs poppler (pdftotext, pdftohtml); without it the PDF checks print SKIP and only the on-screen checks run.
     node audit/pcf_print_test.js index.html */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const A = require(path.join(__dirname, 'deal.js')), V = require(path.join(__dirname, 'devdeal.js')); const HTML = path.resolve(process.argv[2] || 'index.html');
const FIXED = Date.UTC(2026, 10, 13, 12, 0, 0), HOLDS = [3, 5, 7, 10], FLOOR_PT = 6, SIZE_PT = 6.5, MIN_WORDS = 50, RIGHT_EDGE_PT = 580.8;
let checks = 0, fails = 0; const check = (n, ok, d) => { checks++; if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? '  [' + String(d).slice(0, 300) + ']' : '')); };
const sh = (c, a) => cp.spawnSync(c, a, { encoding: 'utf8', maxBuffer: 1 << 28 }); const HAVE_POPPLER = !sh('pdftotext', ['-v']).error;
const LINES = ['GPR', 'Res. Vacancy', 'Bad Debt', 'Commercial', 'Comm. Vacancy', 'Other', 'EGI', 'Controllable', 'Insurance', 'RE Taxes', 'Mgmt Fee', 'Total Opex', 'NOI b/ Res.', 'Reserves', 'NOI'];
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined }), tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pcf-'));
  for (const [id, deck] of [['acquisition', A], ['development', V]]) for (const hold of HOLDS) {
    const tag = id + ' ' + hold + 'y: ', ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } }), p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.route(/supabase\.co|vercel\.app|fonts\.g|cdn\.jsdelivr/, r => r.abort());
    await p.addInitScript(F => { const D = Date; class FD extends D { constructor(...a) { if (a.length) super(...a); else super(F); } static now() { return F; } } window.Date = FD; }, FIXED);
    await p.goto('file://' + HTML); await p.waitForTimeout(700);
    await p.evaluate(([d, h]) => { document.documentElement.classList.add('bk-auth-ok'); bkCreateNewDeal(d); const s = bkLoad(); Object.assign(s, d, { holdYears: h }); bkSave(s); }, [deck, hold]); await p.waitForTimeout(600);
    await p.evaluate(() => showSheet('Property CF')); await p.waitForTimeout(1000);
    /* on screen: the 16-column table is still the one shown, and the months-across blocks are not */
    const scr = await p.evaluate(() => { const t = document.querySelector('#viewport .bk-pcf-screen table'), blocks = [].slice.call(document.querySelectorAll('#viewport table.bk-pcf-pm')), set = document.querySelector('#viewport .bk-pcf-pm-set');
      return { cols: t ? t.rows[0].cells.length : 0, rows: t ? t.tBodies[0].rows.length : 0, shown: !!(t && t.offsetWidth), blocksShown: set && set.getBoundingClientRect().height === 0 && getComputedStyle(set).visibility === 'hidden' ? 0 : 1, blocks: blocks.length,
        cells: t ? [].map.call(t.tBodies[0].rows, r => [].map.call(r.cells, c => c.textContent.trim())) : [] }; });
    check(tag + 'screen: the monthly table keeps its 16 columns and is visible; the print blocks are hidden', scr.cols === 16 && scr.shown && scr.blocks > 0 && scr.blocksShown === 0, scr.cols + ' cols, ' + scr.rows + ' months, ' + scr.blocks + ' blocks');
    /* the print layout, as the browser builds it for printing */
    await p.evaluate(() => window.dispatchEvent(new Event('beforeprint'))); await p.emulateMedia({ media: 'print' }); await p.waitForTimeout(300);
    const dom = await p.evaluate(LN => { const blocks = [].slice.call(document.querySelectorAll('#viewport table.bk-pcf-pm')), months = [], series = {}; LN.forEach(l => series[l] = []);
      blocks.forEach(t => { const hs = [].map.call(t.tHead.rows[0].cells, c => c.textContent.trim()).slice(1); hs.forEach(h => months.push(h)); [].forEach.call(t.tBodies[0].rows, r => { const lab = r.cells[0].textContent.trim(); [].slice.call(r.cells, 1).forEach(c => series[lab].push(c.textContent.trim())); }); });
      const tabs = [].slice.call(document.querySelectorAll('#viewport table')).filter(t => !t.classList.contains('bk-print-orig') && !t.closest('.bk-pcf-screen') && t.querySelector('td') && (t.classList.contains('bk-print-clone') || t.classList.contains('bk-pcf-pm') || t.offsetWidth))
        .map(t => parseFloat(getComputedStyle(t.querySelector('td')).fontSize) * 0.75 * (parseFloat(getComputedStyle(t).zoom) || 1)); return { months, series, pts: tabs, n: blocks.length, sizes: blocks.map(t => t.tHead.rows[0].cells.length - 1) }; }, LINES);
    const nM = scr.rows, sizes = dom.pts.map(x => +x.toFixed(2)), lo = Math.min.apply(null, sizes), hi = Math.max.apply(null, sizes);
    check(tag + 'print: the blocks hold every month once, in order', dom.months.length === nM && dom.months.every((m, i) => m === scr.cells[i][0]), dom.months.length + ' of ' + nM + ' months in ' + dom.n + ' blocks');
    check(tag + 'print: the blocks are equal to within one month, so none is a stub', dom.n > 0 && Math.max.apply(null, dom.sizes) - Math.min.apply(null, dom.sizes) <= 1, dom.sizes.join('/'));
    let same = true, firstDiff = '';
    LINES.forEach((l, j) => { const want = scr.cells.map(r => r[j + 1] === undefined ? '' : r[j + 1]), got = dom.series[l]; if (got.length !== want.length || got.some((v, i) => v !== want[i])) { same = false; firstDiff = firstDiff || l; } });
    check(tag + 'print: every monthly figure is the figure on screen (' + LINES.length + ' lines x ' + nM + ' months, same text)', same, firstDiff || 'identical');
    check(tag + 'print: every table is at or above the ' + FLOOR_PT + ' pt floor', lo >= FLOOR_PT, 'smallest ' + lo + ' pt over ' + sizes.length + ' tables');
    check(tag + 'print: one type size across the page (' + SIZE_PT + ' pt)', hi - lo <= 0.05 && Math.abs(hi - SIZE_PT) <= 0.05, lo + '..' + hi + ' pt');
    /* the PDF itself */
    await p.evaluate(() => { }); const f = path.join(tmp, id + '-' + hold + '.pdf'); await p.pdf({ path: f, format: 'Letter', printBackground: true, preferCSSPageSize: true });
    if (!HAVE_POPPLER) console.log('SKIP ' + tag + 'PDF checks (poppler is not installed)');
    else {
      const txt = sh('pdftotext', ['-layout', f, '-']).stdout, pages = txt.split('\f'); if (!pages[pages.length - 1].trim()) pages.pop();
      const bb = sh('pdftotext', ['-bbox', f, '-']).stdout, pg = []; let cur = null; for (const l of bb.split('\n')) { if (/<page /.test(l)) { cur = { w: [] }; pg.push(cur); } const m = /<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">/.exec(l); if (m && cur) cur.w.push({ y0: +m[2], x1: +m[3] }); }
      const words = pg.map(x => x.w.filter(w => w.y0 > 60 && w.y0 < 745).length), right = Math.max.apply(null, pg.map(x => Math.max.apply(null, x.w.filter(w => w.y0 > 60 && w.y0 < 745).map(w => w.x1).concat([0]))));
      check(tag + 'PDF: no near-blank page (every page has at least ' + MIN_WORDS + ' words)', words.every(w => w >= MIN_WORDS), pages.length + ' pages: ' + words.join(','));
      check(tag + 'PDF: nothing runs past the right margin', right <= RIGHT_EDGE_PT, right.toFixed(1) + ' pt against ' + RIGHT_EDGE_PT);
      const xml = sh('pdftohtml', ['-xml', '-i', '-zoom', '1', '-stdout', '-q', f]).stdout, spec = {}; for (const m of xml.matchAll(/<fontspec id="(\d+)" size="(\d+)"/g)) spec[m[1]] = +m[2]; let minS = 99; for (const m of xml.matchAll(/<text [^>]*font="(\d+)"/g)) { const s = spec[m[1]]; if (s && s < minS) minS = s; }
      check(tag + 'PDF: no text on the page is below ' + FLOOR_PT + ' pt', minS >= FLOOR_PT, 'smallest ' + minS + ' pt');
      const got = {}; LINES.forEach(l => got[l] = []); pages.filter(x => /Monthly Passthrough - months/.test(x)).forEach(x => x.split('\n').forEach(line => { const m = /^\s*(GPR|Res\. Vacancy|Bad Debt|Commercial|Comm\. Vacancy|Other|EGI|Controllable|Insurance|RE Taxes|Mgmt Fee|Total Opex|NOI b\/ Res\.|Reserves|NOI)\s+(\S.*)$/.exec(line); if (m) { const tk = m[2].trim().split(/\s+/); if (tk.every(t => /^\(?-?\$[\d,.]+\)?$|^-$/.test(t))) got[m[1]].push.apply(got[m[1]], tk); } }));
      const pdfSame = LINES.every((l, j) => { const want = scr.cells.map(r => r[j + 1]); return got[l].length === want.length && got[l].every((v, i) => v === want[i]); });
      check(tag + 'PDF: the printed monthly figures are the on-screen figures (' + LINES.length + ' lines x ' + nM + ' months)', pdfSame, pdfSame ? 'identical' : LINES.filter(l => got[l].length !== nM).join(', ') || 'values differ');
      if (words.length > 1 && pg[pg.length - 1]) { const lastFill = pg[pg.length - 1].w.filter(w => w.y0 > 60 && w.y0 < 745); const bottom = lastFill.length ? Math.max.apply(null, lastFill.map(w => w.y0)) : 0; if ((bottom - 60) / 685 < 0.5) console.log('KNOWN ' + tag + 'the last page is under half full (' + Math.round(100 * (bottom - 60) / 685) + '%): a short closing table, not a near-blank page'); }
    }
    check(tag + 'no page errors', errs.length === 0, errs.join(' | ')); await ctx.close();
  }
  console.log('pcf print: ' + checks + ' checks, ' + fails + ' failures'); await b.close(); fs.rmSync(tmp, { recursive: true, force: true }); process.exit(fails ? 1 : 0);
})();
