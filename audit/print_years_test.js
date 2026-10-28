// Printing the Cash Flow Report fits every year column whatever the hold: up to 12 years on one page (landscape from 9 columns), a longer hold split into pages of 10 years
// with the totals on the last. Nothing may be clipped by the page edge (it was: a 10-year hold lost Years 8 to 10, Total and Y1 %). Checked in print layout and in a real PDF.
//   node audit/print_years_test.js index.html
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); const path = require('path'), fs = require('fs'), os = require('os'), { execFileSync } = require('child_process');
const A = require(path.join(__dirname, 'deal.js'));
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  let checks = 0, fails = 0; const check = (n, ok, d) => { checks++; if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? '  [' + String(d).slice(0, 300) + ']' : '')); };
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bkpy-'));
  for (const hold of [3, 5, 8, 10, 15, 25]) {
    const p = await b.newPage({ viewport: { width: 1280, height: 900 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.route(/supabase\.co|vercel\.app|fonts\.g|cdn\.jsdelivr/, r => r.abort()); await p.goto('file://' + path.resolve(process.argv[2])); await p.waitForTimeout(600);
    await p.evaluate(([A, hold]) => { document.documentElement.classList.add('bk-auth-ok'); bkCreateNewDeal(A); const s = bkLoad(); Object.assign(s, A, { holdYears: hold }); bkSave(s); showSheet('Cash Flow Report'); }, [A, hold]);
    await p.waitForTimeout(1500);
    const shown = await p.evaluate(() => { const t = document.getElementById('rp-cashflow'); return t ? [...t.tHead.rows[0].cells].filter(c => /^Year \d+$/.test(c.textContent.trim())).length : 0; });   /* the report itself may show fewer years than the hold */
    await p.evaluate(() => bkPrintPrepare()); await p.emulateMedia({ media: 'print' });
    const land = await p.evaluate(() => /landscape/.test((document.getElementById('bk-print-page') || {}).textContent || '')), px = land ? 973 : 733;
    await p.setViewportSize({ width: px, height: 1000 }); await p.waitForTimeout(300);
    const r = await p.evaluate((px) => { const vis = [...document.querySelectorAll('#viewport table.rp-tbl')].filter(t => getComputedStyle(t).display !== 'none' && t.getBoundingClientRect().width > 0);
      const heads = vis.map(t => [...(t.tHead ? t.tHead.rows[0] : t.rows[0]).cells].map(c => c.textContent.trim()));
      const cf = vis.filter(t => [...(t.tHead ? t.tHead.rows[0] : t.rows[0]).cells].some(c => /^Year \d+$/.test(c.textContent.trim())));
      return { n: cf.length, right: Math.max(0, ...cf.map(t => Math.round(t.getBoundingClientRect().right))), clip: cf.some(t => { let e = t.parentElement; while (e && e.id !== 'viewport') { const cs = getComputedStyle(e); if (/(auto|scroll|hidden)/.test(cs.overflowX) && e.scrollWidth > e.clientWidth + 1) return true; e = e.parentElement; } return false; }),
        years: cf.reduce((a, t) => a.concat([...(t.tHead ? t.tHead.rows[0] : t.rows[0]).cells].map(c => c.textContent.trim()).filter(x => /^Year \d+$/.test(x))), []), total: cf.filter(t => [...(t.tHead ? t.tHead.rows[0] : t.rows[0]).cells].some(c => c.textContent.trim() === 'Total')).length, y1: cf.filter(t => [...(t.tHead ? t.tHead.rows[0] : t.rows[0]).cells].some(c => /Y1 %/.test(c.textContent))).length,
        fs: cf[0] ? parseFloat(getComputedStyle(cf[0]).fontSize) : null, cols: cf[0] ? (cf[0].tHead ? cf[0].tHead.rows[0] : cf[0].rows[0]).cells.length : 0 }; }, px);
    const want = shown > 12 ? Math.ceil(shown / 10) : 1;
    check(hold + '-year hold: ' + (hold >= 9 || hold > 12 ? 'landscape' : 'portrait or landscape by width') + ', ' + want + ' table' + (want > 1 ? 's' : '') + ', every year present once, Total and Y1 % once', r.n === want && r.years.length === shown && shown > 0 && new Set(r.years).size === shown && r.total === 1 && r.y1 === 1 && (shown + 3 >= 9 ? land : true), JSON.stringify({ land, shown, n: r.n, years: r.years.length, total: r.total, y1: r.y1 }));
    check(hold + '-year hold: nothing runs past the page edge (right edge ' + r.right + ' of ' + px + ') or sits in a clipping scroller', r.right <= px + 1 && !r.clip, JSON.stringify({ right: r.right, px, clip: r.clip, fs: r.fs }));
    check(hold + '-year hold: the type stays readable (at least 4.5pt: ' + (r.fs * 0.75).toFixed(1) + 'pt)', r.fs * 0.75 >= 4.5, r.fs);
    if (hold === 10 || hold === 25 || hold === 15) {
      const f = path.join(tmp, 'cf' + hold + '.pdf'); await p.emulateMedia({ media: 'print' }); await p.setViewportSize({ width: 1280, height: 900 }); await p.pdf({ path: f, preferCSSPageSize: true, printBackground: true });
      const txt = execFileSync('pdftotext', ['-layout', f, '-']).toString(), pages = (txt.match(/\f/g) || []).length;
      const missing = []; for (let y = 1; y <= shown; y++) if (!new RegExp('Year ' + y + '\\b').test(txt)) missing.push(y);
      check(hold + '-year hold: the real PDF carries every year the report shows (' + shown + '), Total and Y1 %', missing.length === 0 && /Total/.test(txt) && /Y1\s*%/.test(txt), 'missing ' + missing.join(',') + ' pages ' + pages);
    }
    check(hold + '-year hold: no page errors', errs.length === 0, errs.join(' | ')); await p.close();
  }
  console.log('print_years: ' + checks + ' checks, ' + fails + ' failures'); await b.close(); process.exit(fails ? 1 : 0);
})();
