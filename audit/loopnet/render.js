// Runs a LoopNet listing PDF through the real Import OM workflow (file input, PDF.js reader), screenshots the review page, accepts the deal, and writes the investor summary PDF.
//   BK_PDFJS_DIR=/path/node_modules node audit/loopnet/render.js <listing.pdf> <out-prefix>
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); const path = require('path'), fs = require('fs');
const [file, out] = [process.argv[2], process.argv[3]], T = process.env.BK_PDFJS_DIR;
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined }); const p = await b.newPage({ viewport: { width: 1100, height: 900 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route(/supabase\.co|vercel\.app|fonts\.g/, r => r.abort());
  await p.route(/cdn\.jsdelivr\.net\/npm\//, r => { const u = r.request().url().replace(/^.*\/npm\//, ''), m = /^(@?[^@]+(?:\/[^@/]+)?)@[^/]+\/(.*)$/.exec(u), g = m && T && path.join(T, m[1], m[2].split('?')[0]); if (g && fs.existsSync(g)) r.fulfill({ path: g }); else r.abort(); });
  await p.goto('file://' + path.resolve(__dirname, '../../index.html')); await p.waitForTimeout(800);
  await p.evaluate(() => { document.documentElement.classList.add('bk-auth-ok'); bkCreateNewDeal({ name: 'x', dealId: 'X' }); showSheet('Import OM'); }); await p.waitForTimeout(300);
  await p.setInputFiles('#bkOMFile', file); await p.waitForFunction(() => /✓ Read |could not find|Could not/i.test(document.querySelector('#viewport').innerText), null, { timeout: 300000 }); await p.waitForTimeout(600);
  await p.screenshot({ path: out + '_import.png', fullPage: true });
  await p.evaluate(() => { const S = bkOMState(); if (S.listingOnly) bkOMCreateListing(); else bkOMCreate(); }); await p.waitForTimeout(1500);
  const html = await p.evaluate(() => bkReportHTML()); const d = await b.newPage(); await d.setContent(html); await d.waitForTimeout(500); await d.pdf({ path: out + '_Investor_Summary.pdf', preferCSSPageSize: true, printBackground: true });
  const s = await p.evaluate(() => { const s = bkLoad(), c = bkCalc(); return { name: s.name, price: s.purchasePrice, units: s.units, noi: c.noi, egi: c.egi }; }); console.log(JSON.stringify(s), 'errors', errs); await b.close();
})();
