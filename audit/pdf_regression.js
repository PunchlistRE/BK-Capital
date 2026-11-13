/* PDF REGRESSION (Phase 0 of the design plan). Reads the app, prints real PDFs, never changes the app, a calculation or deal data.
   For each key output it records and then checks: the number of pages, the page size (US Letter portrait, 612 x 792 pt), a hash of every word on every page (a changed, lost or reordered
   figure or label fails), how much ink sits in the outer margin, and a small picture of each page (a layout, fill, line or clipping change fails).
     node audit/pdf_regression.js index.html                  compare every output with the baseline in audit/pdf_baseline/
     node audit/pdf_regression.js index.html --update --only Debt   APPROVE a change: rewrite the baseline for the outputs whose name contains Debt
   The outputs: the investor PDF (acquisition, development), the waterfall summary, and the browser print of the key sheets. The clock is frozen so "Prepared <date>" is stable.
   Needs pdftotext, pdfinfo and pdftoppm (poppler). Baselines depend on the renderer's fonts: regenerate with --update on the machine that runs the check. */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); const fs = require('fs'), path = require('path'), cp = require('child_process'), os = require('os'), crypto = require('crypto');
const args = process.argv.slice(2), HTML = path.resolve(args[0] || 'index.html'), UPDATE = args.indexOf('--update') >= 0, oi = args.indexOf('--only'), ONLY = oi >= 0 ? args[oi + 1].toLowerCase().split(',') : [];
const BASE = path.join(__dirname, 'pdf_baseline'), IDX = path.join(BASE, 'index.json'), TOL = 0.8;
const A = require(path.join(__dirname, 'deal.js')), V = require(path.join(__dirname, 'devdeal.js'));
fs.mkdirSync(BASE, { recursive: true }); const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bkpdf-'));
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const sh = (c, a) => cp.spawnSync(c, a, { encoding: 'utf8' });
const OUT = [
  { id: 'investor-acq-7y', kind: 'investor', deck: A, hold: 7 }, { id: 'investor-dev', kind: 'investor', deck: V, hold: 0 }, { id: 'waterfall-summary-acq', kind: 'waterfall', deck: A, hold: 7 },
  ...['Debt', 'Depreciation', 'Credit Policy', 'Property CF', 'Cash Flow Report', 'Sources and Uses Report', 'Waterfall Report', 'Valuation Report'].map(s => ({ id: 'sheet-' + slug(s), kind: 'sheet', sheet: s, deck: A, hold: 7 }))
].filter(o => !ONLY.length || ONLY.some(x => o.id.includes(x)));

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const tool = await b.newPage(); await tool.setContent('<canvas></canvas>');
  await tool.evaluate(() => { const load = s => new Promise((r, j) => { const i = new Image(); i.onload = () => r(i); i.onerror = j; i.src = s; });
    window.__small = async (b64, w) => { const i = await load('data:image/png;base64,' + b64), h = Math.round(i.height * w / i.width), c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(i, 0, 0, w, h); return c.toDataURL('image/webp', 0.55).split(',')[1]; };
    window.__cmp = async (a, b2) => { const px = async s => { const i = await load('data:image/webp;base64,' + s), c = document.createElement('canvas'); c.width = i.width; c.height = i.height; const x = c.getContext('2d'); x.drawImage(i, 0, 0); return { w: i.width, h: i.height, d: x.getImageData(0, 0, i.width, i.height).data }; };
      const P = await px(a), Q = await px(b2); if (P.w !== Q.w || P.h !== Q.h) return 100; let ch = 0; for (let i = 0; i < P.d.length; i += 4) if (Math.max(Math.abs(P.d[i] - Q.d[i]), Math.abs(P.d[i + 1] - Q.d[i + 1]), Math.abs(P.d[i + 2] - Q.d[i + 2])) > 10) ch++; return 100 * ch / (P.w * P.h); }; });
  const FIXED = Date.UTC(2026, 10, 13, 12, 0, 0); const idx = fs.existsSync(IDX) ? JSON.parse(fs.readFileSync(IDX, 'utf8')) : {}; const fails = [], errors = []; let checked = 0;
  for (const o of OUT) {
    try {
      const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } }); const p = await ctx.newPage(); await p.route(/supabase\.co|vercel\.app|fonts\.g|cdn\.jsdelivr/, r => r.abort());
      await p.addInitScript(F => { const D = Date; class FD extends D { constructor(...a) { if (a.length) super(...a); else super(F); } static now() { return F; } } window.Date = FD; }, FIXED);
      await p.goto('file://' + HTML); await p.waitForTimeout(700);
      await p.evaluate(([d, h]) => { document.documentElement.classList.add('bk-auth-ok'); bkCreateNewDeal(d); if (h) { const s = bkLoad(); Object.assign(s, d, { holdYears: h }); bkSave(s); } showSheet('Home'); }, [o.deck, o.hold]); await p.waitForTimeout(900);
      const f = path.join(tmp, o.id + '.pdf');
      if (o.kind === 'sheet') { await p.evaluate(s => showSheet(s), o.sheet); await p.waitForTimeout(1500); await p.evaluate(() => window.dispatchEvent(new Event('beforeprint'))); await p.emulateMedia({ media: 'print' }); await p.waitForTimeout(300); await p.pdf({ path: f, format: 'Letter', printBackground: true, preferCSSPageSize: true }); }
      else { const html = await p.evaluate(k => k === 'waterfall' ? bkWaterfallSummaryHTML() : bkReportHTML(), o.kind); const ip = await ctx.newPage(); await ip.setContent(html, { waitUntil: 'load' }); await ip.waitForTimeout(500); await ip.pdf({ path: f, preferCSSPageSize: true, printBackground: true }); }
      await ctx.close();
      /* measure */
      const info = sh('pdfinfo', [f]).stdout, pages = +(/Pages:\s+(\d+)/.exec(info) || [])[1], size = (/Page size:\s+([\d.]+) x ([\d.]+)/.exec(info) || []).slice(1, 3).map(Number);
      const words = sh('pdftotext', ['-enc', 'UTF-8', f, '-']).stdout.replace(/\s+/g, ' ').trim(), hash = crypto.createHash('sha1').update(words).digest('hex').slice(0, 16);
      sh('pdftoppm', ['-r', '30', '-png', f, path.join(tmp, o.id)]); const pngs = fs.readdirSync(tmp).filter(x => x.startsWith(o.id + '-') && x.endsWith('.png')).sort();
      let ink = 0; { const q = sh('pdftoppm', ['-r', '40', '-f', '1', '-l', '1', f, path.join(tmp, o.id + '-m')]); const pp = fs.readdirSync(tmp).find(x => x.startsWith(o.id + '-m')); if (pp) { const buf = fs.readFileSync(path.join(tmp, pp)), m = /^P6\s+(\d+)\s+(\d+)\s+255\s/.exec(buf.slice(0, 30).toString('latin1')); if (m) { const d = buf.slice(m[0].length), w = +m[1], h = +m[2], mg = 6; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { if (x < mg || x >= w - mg || y < mg || y >= h - mg) { const t = (y * w + x) * 3; if (0.299 * d[t] + 0.587 * d[t + 1] + 0.114 * d[t + 2] < 235) ink++; } } } } }
      const thumbs = []; for (const pg of pngs.slice(0, 6)) thumbs.push(await tool.evaluate(([b64, w]) => window.__small(b64, w), [fs.readFileSync(path.join(tmp, pg)).toString('base64'), 255]));
      const rec = { pages, size, words: words.split(' ').length, hash, ink };
      if (UPDATE) { idx[o.id] = rec; thumbs.forEach((t, i) => fs.writeFileSync(path.join(BASE, o.id + '-p' + (i + 1) + '.webp'), Buffer.from(t, 'base64'))); continue; }
      const base = idx[o.id]; if (!base) { errors.push('no baseline for ' + o.id + ' (run with --update)'); continue; } checked++;
      const why = []; if (rec.pages !== base.pages) why.push('pages ' + base.pages + ' -> ' + rec.pages); if (size[0] !== 612 || size[1] !== 792) why.push('page size ' + size.join(' x ') + ' (must be 612 x 792)');
      if (rec.hash !== base.hash) why.push('words changed (' + base.words + ' -> ' + rec.words + ')'); if (rec.ink > base.ink * 1.05 + 20) why.push('margin ink ' + base.ink + ' -> ' + rec.ink);
      for (let i = 0; i < Math.min(thumbs.length, base.pages, 6); i++) { const bf = path.join(BASE, o.id + '-p' + (i + 1) + '.webp'); if (!fs.existsSync(bf)) continue; const pct = await tool.evaluate(([a, c]) => window.__cmp(a, c), [fs.readFileSync(bf).toString('base64'), thumbs[i]]); if (pct > TOL) why.push('page ' + (i + 1) + ' picture changed ' + pct.toFixed(2) + '%'); }
      if (why.length) fails.push(o.id + ': ' + why.join('; '));
    } catch (e) { errors.push(o.id + ': ' + String(e.message).slice(0, 90)); }
  }
  await b.close();
  if (UPDATE) { fs.writeFileSync(IDX, JSON.stringify(idx, null, 1)); console.log('PDF baselines written for ' + OUT.length + ' outputs (' + path.relative(process.cwd(), BASE) + ')'); process.exit(errors.length ? 1 : 0); }
  fails.forEach(f => console.log('FAIL ' + f)); errors.forEach(e => console.log('ERROR ' + e)); console.log(checked + ' PDFs checked, ' + fails.length + ' changed, ' + errors.length + ' errors'); process.exit(fails.length || errors.length ? 1 : 0);
})();
