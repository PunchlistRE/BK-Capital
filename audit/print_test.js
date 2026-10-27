// Print / Save PDF for any section: every sheet has the button; the printed page carries the Punchlist logo and the deal summary and leaves the
// application chrome out; the PDF has the section's content and is more than blank.
//   node audit/print_test.js index.html
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); const path = require('path'), fs = require('fs'), os = require('os'), { execFileSync } = require('child_process');
const A = require(path.join(__dirname, 'deal.js'));
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route(/supabase\.co|vercel\.app|fonts\.g|cdn\.jsdelivr/, r => r.abort()); await p.goto('file://' + path.resolve(process.argv[2])); await p.waitForTimeout(700);
  await p.evaluate(() => document.documentElement.classList.add('bk-auth-ok'));
  let checks = 0, fails = 0; const check = (n, ok, d) => { checks++; if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? '  [' + d + ']' : '')); };
  await p.evaluate((A) => { bkCreateNewDeal(A); const s = bkLoad(); Object.assign(s, A); bkSave(s); }, A);
  const sheets = ['Deal Underwrite', 'Operating Underwrite', 'Property CF', 'Debt', 'Debt Schedule', 'Returns', 'Equity Waterfall', 'Sources & Uses', 'IC Memo', 'Credit Policy', 'Sensitivity', 'Financing Compare', 'Pre-Offer Bid', 'Cash Flow Report'];
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bkprint-'));
  const nobtn = [];
  for (const sh of sheets) {
    const has = await p.evaluate(async (sh) => { showSheet(sh); await new Promise(r => setTimeout(r, 900)); return !!document.querySelector('#viewport .bk-print-btn, #viewport .pf-print, #viewport .rp-bar button'); }, sh);
    if (!has) nobtn.push(sh);
  }
  check('every section has a print / save PDF button (' + sheets.length + ' sheets checked)', nobtn.length === 0, nobtn.join(', '));
  for (const sh of ['Debt', 'Equity Waterfall', 'Returns']) {
    await p.evaluate(async (sh) => { showSheet(sh); await new Promise(r => setTimeout(r, 1200)); bkPrintPrepare(); }, sh);
    const info = await p.evaluate(() => { const h = document.getElementById('bk-print-head'); return { html: h ? h.innerText : '', logo: !!(h && h.querySelector('svg')), page: (document.getElementById('bk-print-page') || {}).textContent || '', foot: !!document.getElementById('bk-print-foot') }; });
    check(sh + ': the printed header has the Punchlist logo, the deal name, location, units, price and the section title', info.logo && /Punchlist Capital/.test(info.html) && /Audit Test Apartments/.test(info.html) && /Charlotte, NC/.test(info.html) && /120/.test(info.html) && /\$24,000,000/.test(info.html) && new RegExp(sh.replace(/[()]/g, '\\$&'), 'i').test(info.html), info.html.replace(/\s+/g, ' ').slice(0, 140));
    check(sh + ': headline returns are in the header (levered IRR, multiple)', /Levered IRR/i.test(info.html) && /\d+\.\d\dx/.test(info.html));
    check(sh + ': a page size is set (letter; landscape for wide schedules)', /size:letter (portrait|landscape)/.test(info.page), info.page.slice(0, 60));
    await p.emulateMedia({ media: 'print' });
    const hid = await p.evaluate(() => ['.rail', '.tabnav-primary', '.bk-stepnav', '.side-col'].map(s => { const e = document.querySelector(s); return !e || getComputedStyle(e).display === 'none'; }));
    check(sh + ': in print the sidebar, tabs, step bar and snapshot column are hidden', hid.every(Boolean), JSON.stringify(hid));
    const pdf = path.join(tmp, sh.replace(/[^A-Za-z0-9]/g, '_') + '.pdf'); await p.pdf({ path: pdf, preferCSSPageSize: true, printBackground: true });
    await p.emulateMedia({ media: 'screen' }); await p.evaluate(() => bkPrintCleanup());
    let txt = ''; try { txt = execFileSync('pdftotext', ['-layout', pdf, '-'], { encoding: 'utf8' }); } catch (e) { txt = ''; }
    check(sh + ': the PDF has the logo text, deal summary and the section\'s own content', /Punchlist Capital/.test(txt) && /Audit Test Apartments/.test(txt) && txt.length > 800, txt.length + ' chars');
    check(sh + ': the PDF carries no sidebar text (Property Editor, Advanced) and no button labels', !/Property Editor/.test(txt) && !/Print \/ Save PDF/.test(txt));
  }
  const gone = await p.evaluate(() => !document.getElementById('bk-print-head') && !document.getElementById('bk-print-foot'));
  check('after printing the page is back to normal (header and footer removed)', gone);
  check('no page errors', errs.length === 0, errs.slice(0, 2).join(' | '));
  console.log(checks + ' checks, ' + fails + ' failures'); await b.close(); process.exit(fails ? 1 : 0);
})();
