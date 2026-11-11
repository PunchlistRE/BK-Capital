// Print / PDF on the page (src/167): a printout is the light theme whatever theme is on screen, on US Letter, with every year of the hold present and nothing past the margins.
// The generated PDFs are tested, not the print stylesheet: Chromium print-to-PDF with the dark theme on screen (and the OS dark scheme), then pdfinfo (612 x 792 pt), pdftotext (every
// "Year N" label is there) and the rendered pages (a light page: no dark fills, ink only inside the margins). Cash Flow, Sources and Uses, Present Value, After-Tax and Debt Schedule at 3, 10 and 15 years.
//   node audit/print_light_test.js index.html     (needs pdfinfo, pdftotext, pdftoppm)
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); const path = require('path'); const fs = require('fs'); const cp = require('child_process'); const os = require('os');
const A = require(path.join(__dirname, 'deal.js'));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bkprint-'));
const ppm = (pdf, page) => { const r = cp.spawnSync('pdftoppm', ['-r', '50', '-f', String(page), '-l', String(page), pdf, path.join(tmp, 'pg')]); const f = fs.readdirSync(tmp).filter(x => /^pg-\d+\.ppm$/.test(x)).sort().pop(); if (!f) return null; const buf = fs.readFileSync(path.join(tmp, f)); fs.unlinkSync(path.join(tmp, f)); const m = /^P6\s+(\d+)\s+(\d+)\s+255\s/.exec(buf.slice(0, 30).toString('latin1')); if (!m) return null; return { w: +m[1], h: +m[2], d: buf.slice(m[0].length) }; };
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  let checks = 0, fails = 0; const check = (n, ok, d) => { checks++; if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? '  [' + String(d).slice(0, 380) + ']' : '')); };
  const SHEETS = ['Cash Flow Report', 'Sources and Uses Report', 'Present Value Report', 'After-Tax Report', 'Debt Schedule'];
  for (const years of [3, 10, 15]) for (const sheet of SHEETS) {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' }); const p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
    await p.route(/supabase\.co|vercel\.app|fonts\.g|cdn\.jsdelivr/, r => r.abort()); await p.goto('file://' + path.resolve(process.argv[2])); await p.waitForTimeout(600);
    await p.evaluate(([d, y, sh]) => { document.documentElement.classList.add('bk-auth-ok'); bkCreateNewDeal(d); const s = bkLoad(); Object.assign(s, d, { holdYears: y }); bkSave(s); window.bkTheme.set('dark'); showSheet(sh); }, [A, years, sheet]); await p.waitForTimeout(800);
    await p.emulateMedia({ media: 'print', colorScheme: 'dark' }); await p.evaluate(() => window.dispatchEvent(new Event('beforeprint'))); await p.waitForTimeout(400);
    const pdf = path.join(tmp, (sheet + years).replace(/\W+/g, '_') + '.pdf'); await p.pdf({ path: pdf, preferCSSPageSize: true, printBackground: true });
    const info = cp.spawnSync('pdfinfo', [pdf]).stdout.toString(), pages = +(/Pages:\s+(\d+)/.exec(info) || [0, 0])[1], size = (/Page size:\s+(.*)/.exec(info) || [0, ''])[1];
    const txt = cp.spawnSync('pdftotext', ['-layout', pdf, '-']).stdout.toString(), labels = []; for (let y = 1; y <= years; y++) if (!new RegExp('Year ' + y + '\\b').test(txt)) labels.push(y);
    let lightOk = true, inkOk = true, detail = [];
    for (let pg = 1; pg <= pages; pg++) { const im = ppm(pdf, pg); if (!im) { lightOk = false; continue; } let dark = 0, n = im.w * im.h, edge = 0; const m = Math.round(0.2 * 50);   /* 0.2 in margin ring at 50 dpi */
      for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) { const o = (y * im.w + x) * 3, lum = 0.299 * im.d[o] + 0.587 * im.d[o + 1] + 0.114 * im.d[o + 2]; if (lum < 90) dark++; if (lum < 235 && (x < m || x >= im.w - m || y < m || y >= im.h - m)) edge++; }
      if (dark / n > 0.2) lightOk = false; if (edge > 0) inkOk = false; detail.push([pg, +(dark / n * 100).toFixed(1) + '% dark', edge + ' ink px in margin']); }
    check(sheet + ', ' + years + ' years, dark theme on screen: a US Letter PDF (612 x 792 pt), every year label present, a light page (no dark fills), no ink in the 0.2 in margin ring',
      /612 x 792/.test(size) && labels.length === 0 && lightOk && inkOk && pages >= 1 && pages <= (sheet === 'Debt Schedule' ? 20 : 4) && p.errs.length === 0, JSON.stringify({ pages, size, missing: labels, detail }));
    const back = await p.evaluate(() => { window.dispatchEvent(new Event('afterprint')); return document.documentElement.getAttribute('data-theme'); });
    if (sheet === SHEETS[0] && years === 3) check('after printing the dark theme on screen is restored', back === 'dark', back);
    await ctx.close();
  }
  console.log(checks + ' checks, ' + fails + ' failures'); await b.close(); fs.rmSync(tmp, { recursive: true, force: true }); process.exit(fails ? 1 : 0);
})();
