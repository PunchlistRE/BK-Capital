// Runs real source files through BK Capital's actual importers and records, per file and importer, what the user would see: result message, key fields, confidence and timing. Nothing is inferred here;
// this only observes. Usage: BK_PDFJS_DIR=<node_modules with pdfjs-dist + tesseract.js> node audit/intake/probe.js out.json file1 file2 ...
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); const path = require('path'), fs = require('fs');
const T = process.env.BK_PDFJS_DIR, out = process.argv[2], files = process.argv.slice(3);
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined }); const ctx = await b.newContext({ viewport: { width: 1300, height: 900 } }), p = await ctx.newPage();
  await p.route(/cdn\.jsdelivr\.net\/npm\//, r => { const u = r.request().url().replace(/^.*\/npm\//, ''), m = /^(@?[^@]+(?:\/[^@/]+)?)@[^/]+\/(.*)$/.exec(u), g = m && T && path.join(T, m[1], m[2].split('?')[0]); if (g && fs.existsSync(g)) r.fulfill({ path: g }); else r.abort(); });
  await p.route(/supabase\.co|vercel\.app|fonts\.g/, r => r.abort());
  await p.goto('file://' + path.resolve(__dirname, '../../index.html')); await p.waitForTimeout(800);
  await p.evaluate(() => { document.documentElement.classList.add('bk-auth-ok'); bkCreateNewDeal({ name: 'probe', dealId: 'PROBE' }); });
  const res = [];
  const wait = (re, ms) => p.waitForFunction((s) => new RegExp(s, 'i').test(document.querySelector('#viewport').innerText), re, { timeout: ms }).then(() => true).catch(() => false);
  for (const f of files) {
    const ext = path.extname(f).toLowerCase(), name = path.basename(f).replace(/^[0-9a-f]{8}-/, ''), row = { file: name, bytes: fs.statSync(f).size, ext, importers: {} };
    const tryOne = async (label, sheet, input, doneRe, grab) => { const t0 = Date.now(); try { await p.evaluate(() => { Object.keys(localStorage).filter(k => k.indexOf('bkcapital.omocr.') === 0).forEach(k => localStorage.removeItem(k)); });
        await p.evaluate((s) => showSheet(s), sheet); await p.waitForTimeout(300); await p.setInputFiles(input, f); const ok = await wait(doneRe, 420000); await p.waitForTimeout(700);
        const g = await p.evaluate(grab); row.importers[label] = Object.assign({ finished: ok, seconds: Math.round((Date.now() - t0) / 1000) }, g); } catch (e) { row.importers[label] = { error: String(e.message).slice(0, 200), seconds: Math.round((Date.now() - t0) / 1000) }; } };
    if (ext === '.pdf' || /\.(xlsx|xlsm|csv)$/.test(ext)) await tryOne('OM', 'Import OM', '#bkOMFile', '✓ Read |could not find|Could not|has no readable|land listing|looks like a development|This looks like', () => { const S = bkOMState(), t = document.querySelector('#viewport').innerText, o = S.om || {}; const ie = o.ie || {};
      return { msg: (t.match(/(✓ Read[^\n]*|⚠[^\n]*|This looks like[^\n]*)/) || [''])[0].slice(0, 400), method: S.info && S.info.method, pages: S.info && S.info.pages && S.info.pages.length, ocrPages: S.info && S.info.ocrPages && S.info.ocrPages.length, layout: o.layout || null, name: o.name, street: o.street, city: o.city, price: o.price, units: o.units, sf: o.sf, year: o.yearBuilt,
        noi: ie.noi && (ie.noi.cur != null ? ie.noi.cur : null), expLines: ie.exp && ie.exp.length, mix: (o.unitMix || []).length, caps: o.capRates || null, tie: /TIES TO/.test(t), conf: (t.match(/(\d+) verified\s+(\d+) check\s+(\d+) low\s+(\d+) assumed/i) || []).slice(1).map(Number), dev: S.mode === 'dev', cover: !!(S.info && S.info.cover), listingOnly: !!S.listingOnly, sources: o.sources || null }; });
    if (ext !== '.pdf') {
      await tryOne('T12', 'Import Deal', '#bkImportFile', 'Found \\d+ propert|No Yardi-format|Could not read|no readable text|could not|Unsupported|did not find', () => { const t = document.querySelector('#viewport').innerText; return { msg: (t.match(/(Found \d+ propert[^\n]*|No Yardi-format[^\n]*|Could not read[^\n]*|[^\n]*no readable text[^\n]*|[^\n]*did not find[^\n]*)/) || [''])[0].slice(0, 300), text: t.slice(t.indexOf('IMPORT'), t.indexOf('IMPORT') + 900).replace(/\s+/g, ' ') }; });
      await tryOne('RentRoll', 'Import Rent Roll', '#bkRRFile', 'Read \\d+ rows|No rent-roll header|Could not read|no readable text|could not', () => { const t = document.querySelector('#viewport').innerText, c = (typeof bkRRConf === 'function') ? bkRRConf() : null; return { msg: (t.match(/(Read \d+ rows[^\n]*|No rent-roll header[^\n]*|Could not read[^\n]*|[^\n]*no readable text[^\n]*)/) || [''])[0].slice(0, 300), conf: c && c.sum }; });
    }
    res.push(row); console.log(JSON.stringify(row).slice(0, 700)); fs.writeFileSync(out, JSON.stringify(res, null, 1)); }
  await b.close();
})();
