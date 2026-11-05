// Ingestion benchmark, Import OM reader: what the reader returns for each real document, scored field by field against a hand-read answer key.
//   node audit/ingest_bench/om_baseline.js <folder-of-documents> [--app index.html] [--key audit/ingest_bench/answer_key.json] [--out results.json] [doc.pdf ...]
// Text recognition for image-only pages: set BK_TESSERACT_DIR to a node_modules folder holding tesseract.js@5.1.1, tesseract.js-core@5.1.1, @tesseract.js-data/eng@1.0.0 and pdfjs-dist@3.11.174
// (the app loads them from a CDN; this routes the same URLs to the local copies). Nothing is uploaded anywhere.
// A field counts as correct only if it equals the answer key. A wrong value is a failure, a value where the document states none is a false positive, a value not found is missing.
// This measures correctness. real_import_bench.js measures whether a read "ties" (income less expenses equals the printed NOI), which a wrong-but-consistent read can also do.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); const path = require('path'), fs = require('fs');
const argv = process.argv.slice(2), opt = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv.splice(i, 2)[1] : d; };
const APP = path.resolve(opt('app', path.join(__dirname, '..', '..', 'index.html'))), KEY = JSON.parse(fs.readFileSync(opt('key', path.join(__dirname, 'answer_key.json')), 'utf8')), OUT = opt('out', null);
const DIR = argv.shift(), only = argv; if (!DIR || !fs.existsSync(DIR)) { console.error('usage: node audit/ingest_bench/om_baseline.js <folder> [--app index.html] [--key answer_key.json] [--out results.json] [doc.pdf ...]'); process.exit(2); }
const T = process.env.BK_TESSERACT_DIR;
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined }); const results = [], names = Object.keys(KEY).filter(k => k[0] !== '_' && (!only.length || only.includes(k)) && fs.existsSync(path.join(DIR, k)));
  for (const name of names) {
    const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
    if (T) await p.route(/cdn\.jsdelivr\.net\/npm\//, r => { const u = r.request().url().replace(/^.*\/npm\//, ''), m = /^(@?[^@]+(?:\/[^@/]+)?)@[^/]+\/(.*)$/.exec(u), g = m && path.join(T, m[1], m[2].split('?')[0]); if (g && fs.existsSync(g)) r.fulfill({ path: g }); else r.abort(); });
    await p.route(/supabase\.co|vercel\.app|fonts\.g/, r => r.abort()); await p.goto('file://' + APP); await p.waitForTimeout(800);
    await p.evaluate(() => { document.documentElement.classList.add('bk-auth-ok'); bkCreateNewDeal({ name: 'Bench', dealId: 'BENCH' }); Object.keys(localStorage).filter(k => k.indexOf('bkcapital.omocr.') === 0).forEach(k => localStorage.removeItem(k)); });
    const t0 = Date.now(); const row = { doc: name, seconds: null, extracted: {}, pageSources: null };
    try {
      await p.evaluate(() => showSheet('Import OM')); await p.waitForTimeout(300); await p.setInputFiles('#bkOMFile', path.join(DIR, name));
      await p.waitForFunction(() => /✓ Read |could not find|Could not|has no readable|land listing|looks like a development/i.test(document.querySelector('#viewport').innerText), null, { timeout: 900000 }); await p.waitForTimeout(600);
      const r = await p.evaluate(() => { const S = window.__bkOMState || {}, om = S.om || null, dev = S.dev || null, ie = (om && om.ie) || {}, find = (rx) => { const e = (ie.exp || []).find(x => rx.test(x.label || '')); return e ? e.cur : null; };
        return { om: om && { price: om.price, units: om.units, sf: om.sf, yearBuilt: om.yearBuilt, noi: ie.noi && ie.noi.cur, egi: ie.egi && ie.egi.cur, expTot: ie.expTot && ie.expTot.cur, taxes: find(/tax/i), insurance: find(/insur/i), zip: om.zip, state: om.state, sources: om.sources }, dev: dev && JSON.parse(JSON.stringify(dev, (k, v) => (typeof v === 'string' && v.length > 120 ? v.slice(0, 120) : v))) }; });
      row.extracted = Object.assign({}, r.dev || {}, r.om || {}); row.pageSources = r.om && r.om.sources || null; delete row.extracted.sources;
    } catch (e) { row.error = String(e.message).split('\n')[0]; }
    row.seconds = +((Date.now() - t0) / 1000).toFixed(1); results.push(row); await p.close();
    console.log(name.padEnd(32) + String(row.seconds).padStart(7) + 's  ' + (row.error ? 'ERROR ' + row.error : JSON.stringify(Object.fromEntries(Object.keys(KEY[name].fields).map(k => [k, row.extracted[k]])))));
  }
  const rows = []; for (const x of results) for (const [k, f] of Object.entries(KEY[x.doc].fields)) { const want = f.value, have = x.extracted[k] === undefined || x.extracted[k] === '' ? null : x.extracted[k]; let status;
    if (want === null) status = have === null ? 'ok (blank, as it should be)' : 'FALSE POSITIVE'; else if (have === null) status = 'MISSING'; else status = (typeof want === 'number' ? Number(have) === want : String(have) === String(want)) ? 'ok' : 'WRONG';
    rows.push({ doc: x.doc, field: k, class: f.class, want, have, status }); }
  const stat = (f) => { const a = rows.filter(f), ok = a.filter(r => /^ok/.test(r.status)).length; return a.length ? ok + ' of ' + a.length + ' (' + Math.round(100 * ok / a.length) + '%)' : 'n/a'; };
  console.log('\nfield by field, against the hand-read answer key:'); console.log('  all fields         ' + stat(() => true)); console.log('  financial fields   ' + stat(r => r.class === 'financial')); console.log('  descriptive fields ' + stat(r => r.class !== 'financial'));
  console.log('  not correct:'); rows.filter(r => !/^ok/.test(r.status)).forEach(r => console.log('    ' + r.doc.padEnd(30) + r.field.padEnd(11) + r.status.padEnd(15) + 'wanted ' + JSON.stringify(r.want) + ', got ' + JSON.stringify(r.have)));
  if (OUT) fs.writeFileSync(OUT, JSON.stringify({ documents: results, fields: rows }, null, 1)); await b.close();
})();
