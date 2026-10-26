// Runs a folder of real documents through the importers and reports how many read cleanly and how fast, so the hit rate on YOUR files is a number, not a guess.
//   node audit/real_import_bench.js /path/to/docs [index.html]
// Put files in subfolders om/, t12/ and rentroll/ (or name them so: "...OM...", "...T12...", "...rent roll..."). Nothing is uploaded anywhere; files are read by the page in a local browser.
// "Clean" means: an OM or T-12 whose income and expense lines tie to the document's own NOI / net income (no figure marked Low), or a rent roll with no figure marked Low.
// Text recognition for image-only OMs: set BK_TESSERACT_DIR to a node_modules folder holding tesseract.js, tesseract.js-core, @tesseract.js-data/eng and pdfjs-dist, or leave it unset to use the CDN.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const path = require('path'), fs = require('fs');
const dir = process.argv[2], app = path.resolve(process.argv[3] || path.join(__dirname, '..', 'index.html'));
if (!dir || !fs.existsSync(dir)) { console.error('usage: node audit/real_import_bench.js <folder> [index.html]'); process.exit(2); }
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const kindOf = f => { const rel = path.relative(dir, f).toLowerCase(), ext = path.extname(f).toLowerCase();
  if (!/\.(pdf|xlsx|xlsm|csv)$/.test(ext)) return null;
  if (/(^|[\\/])om[\\/]/.test(rel) || /\b(om|offering|memorandum)\b/.test(rel)) return ext === '.pdf' ? 'om' : null;
  if (/(^|[\\/])rent.?roll[\\/]/.test(rel) || /rent.?roll|\brr\b/.test(rel)) return 'rentroll';
  if (/(^|[\\/])t-?12[\\/]/.test(rel) || /t-?12|yardi|trailing|operating statement|income statement/.test(rel)) return 't12';
  return ext === '.pdf' ? 'om' : 't12'; };
(async () => {
  const files = walk(dir).map(f => ({ f, kind: kindOf(f) })).filter(x => x.kind); if (!files.length) { console.error('no pdf / xlsx / csv files found'); process.exit(2); }
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined }); const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }), p = await ctx.newPage();
  const T = process.env.BK_TESSERACT_DIR; if (T) await p.route(/cdn\.jsdelivr\.net\/npm\//, r => { const u = r.request().url().replace(/^.*\/npm\//, ''), m = /^(@?[^@]+(?:\/[^@/]+)?)@[^/]+\/(.*)$/.exec(u), g = m && path.join(T, m[1], m[2].split('?')[0]); if (g && fs.existsSync(g)) r.fulfill({ path: g }); else r.abort(); });
  await p.route(/supabase\.co|vercel\.app|fonts\.g/, r => r.abort());
  await p.goto('file://' + app); await p.waitForTimeout(800);
  await p.evaluate(() => { document.documentElement.classList.add('bk-auth-ok'); bkCreateNewDeal({ name: 'Bench', dealId: 'BENCH' }); });
  const rows = [];
  for (const { f, kind } of files) {
    const row = { file: path.relative(dir, f), kind, seconds: null, clean: false, summary: null, note: '' }; const t0 = Date.now();
    try {
      await p.evaluate(() => { Object.keys(localStorage).filter(k => k.indexOf('bkcapital.omocr.') === 0).forEach(k => localStorage.removeItem(k)); });
      if (kind === 'om') {
        await p.evaluate(() => showSheet('Import OM')); await p.waitForTimeout(300); await p.setInputFiles('#bkOMFile', f);
        await p.waitForFunction(() => /✓ Read |could not find|Could not|has no readable|land listing|looks like a development/i.test(document.querySelector('#viewport').innerText), null, { timeout: 600000 }); await p.waitForTimeout(500);
        const r = await p.evaluate(() => { const S = window.__bkOMState || {}, t = document.querySelector('#viewport').innerText, m = t.match(/(\d+) verified\s+(\d+) check\s+(\d+) low\s+(\d+) assumed/i); return { tie: /TIES TO (OM|PRO FORMA)/.test(t), sum: m ? { verified: +m[1], check: +m[2], low: +m[3], assumed: +m[4] } : null, msg: (document.querySelector('#viewport .pl-msg') || {}).innerText || t.slice(t.indexOf('Read'), t.indexOf('Read') + 160), full: S.info && S.info.fullPages, pages: S.info && S.info.n, dev: S.mode === 'dev' }; });
        row.summary = r.sum; row.clean = !!(r.tie && r.sum && r.sum.low === 0); row.note = (r.pages ? r.pages + ' pages' + (r.full ? ', ' + r.full + ' read in full' : '') : '') + (r.dev ? ', development site (needs the workbook)' : '') + (r.tie ? '' : ', NOI did not tie or was not found');
      } else if (kind === 't12') {
        await p.evaluate(() => showSheet('Import Deal')); await p.waitForTimeout(300); await p.setInputFiles('#bkImportFile', f);
        await p.waitForFunction(() => /Found \d+ propert|No Yardi-format|Could not read|no readable text/i.test(document.querySelector('#viewport').innerText), null, { timeout: 120000 }); await p.waitForTimeout(400);
        const parsed = await p.evaluate(async ([b64, nm]) => { const u8 = Uint8Array.from(atob(b64), c => c.charCodeAt(0)); const ps = bkImportExtract(await bkImportParseFile(new File([u8], nm))); return ps.map(x => ({ name: x.name, tied: x.tied, gap: x.gap === null ? null : Math.round(x.gap), conf: bkImportConfidence(x, x.cap).sum })); }, [fs.readFileSync(f).toString('base64'), path.basename(f)]);
        const sum = parsed.reduce((a, x) => ({ verified: a.verified + x.conf.verified, check: a.check + x.conf.check, low: a.low + x.conf.low, assumed: a.assumed + x.conf.assumed }), { verified: 0, check: 0, low: 0, assumed: 0 });
        row.summary = sum; row.clean = parsed.length > 0 && parsed.every(x => x.tied) && sum.low === 0; row.note = parsed.length + ' propert' + (parsed.length === 1 ? 'y' : 'ies') + ', ' + parsed.filter(x => x.tied).length + ' tie' + (parsed.length ? '' : ' (none found)');
      } else {
        await p.evaluate(() => showSheet('Import Rent Roll')); await p.waitForTimeout(300); await p.setInputFiles('#bkRRFile', f);
        await p.waitForFunction(() => /Read \d+ rows|No rent-roll header|Could not read|no readable text/i.test(document.querySelector('#viewport').innerText), null, { timeout: 120000 }); await p.waitForTimeout(400);
        const r = await p.evaluate(() => { const c = bkRRConf(); return c && { sum: c.sum, bad: Object.keys(c.fields).filter(k => c.fields[k].l === 'low').map(k => k + ': ' + c.fields[k].why) }; });
        row.summary = r && r.sum; row.clean = !!(r && r.sum.low === 0); row.note = r ? r.bad.join('; ') : 'no rent-roll header found';
      }
    } catch (e) { row.note = 'error: ' + String(e.message || e).split('\n')[0]; }
    row.seconds = +((Date.now() - t0) / 1000).toFixed(1); rows.push(row);
    console.log((row.clean ? 'CLEAN ' : 'CHECK ') + row.kind.padEnd(8) + String(row.seconds).padStart(6) + 's  ' + row.file + (row.note ? '  - ' + row.note : '')); }
  const by = k => rows.filter(r => r.kind === k), pct = (a) => a.length ? Math.round(100 * a.filter(r => r.clean).length / a.length) + '% (' + a.filter(r => r.clean).length + ' of ' + a.length + ')' : 'none';
  const med = a => { const s = a.map(r => r.seconds).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
  console.log('\nRead cleanly on the first pass');
  ['om', 't12', 'rentroll'].forEach(k => console.log('  ' + k.padEnd(9) + pct(by(k)) + (by(k).length ? '   median ' + med(by(k)) + 's' : '')));
  fs.writeFileSync(path.join(dir, 'import_bench_results.json'), JSON.stringify(rows, null, 1)); console.log('\nDetails: ' + path.join(dir, 'import_bench_results.json'));
  await b.close(); process.exit(0);
})();
