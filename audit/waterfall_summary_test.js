// One-page waterfall summary (src/145 waterfallPages one-page branch, button in src/205): one US Letter page at every hold (3, 5, 10, 15 years and a development deck), nothing clipped,
// its totals tie to the engine (total distributions = the monthly engine's distributions; LP + GP = total; the tier amounts add to the total), the button is on the Equity Waterfall page.
//   node audit/waterfall_summary_test.js index.html     (needs pdfinfo)
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); const path = require('path'), fs = require('fs'), os = require('os'), cp = require('child_process');
const A = require(path.join(__dirname, 'deal.js')), V = require(path.join(__dirname, 'devdeal.js')); const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bkwf-'));
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  let checks = 0, fails = 0; const check = (n, ok, d) => { checks++; if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? '  [' + String(d).slice(0, 360) + ']' : '')); };
  const num = (t) => { t = String(t).trim(); if (/^[–—-]$/.test(t)) return 0; const neg = /^\(.*\)$/.test(t); const v = parseFloat(t.replace(/[(),$%]/g, '')); return neg ? -v : v; };
  for (const [tag, deal, holds] of [['acquisition', A, [3, 5, 10, 15]], ['development', V, [null]]]) for (const hold of holds) {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }); const p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
    await p.route(/supabase\.co|vercel\.app|fonts\.g|cdn\.jsdelivr/, r => r.abort()); await p.goto('file://' + path.resolve(process.argv[2])); await p.waitForTimeout(700);
    const R = await p.evaluate(async ([d, y]) => { document.documentElement.classList.add('bk-auth-ok'); bkCreateNewDeal(d); if (y) { const s = bkLoad(); Object.assign(s, d, { holdYears: y }); bkSave(s); } showSheet('Equity Waterfall'); await new Promise(r => setTimeout(r, 600));
      const btn = !!document.querySelector('button[onclick="bkWaterfallSummaryOpen()"]'), html = bkWaterfallSummaryHTML(), mr = bkMonthlyReturns(); return { btn, html, dist: mr.dist }; }, [deal, hold]);
    const ip = await ctx.newPage(); await ip.setContent(R.html, { waitUntil: 'load' }); await ip.waitForTimeout(400);
    const D = await ip.evaluate(() => { const pages = document.querySelectorAll('section.page'), g = (id) => [...document.querySelectorAll('table.kv')].find(t => t.tHead && t.tHead.textContent.indexOf(id) >= 0);
      const tier = g('What each tier paid'), rows = tier ? [...tier.tBodies[0].rows].map(r => [...r.cells].map(c => c.textContent.trim())) : [], res = g('Results'), rr = res ? [...res.tBodies[0].rows].map(r => [...r.cells].map(c => c.textContent.trim())) : [], cash = document.querySelector('table.wfone'), head = cash ? [...cash.tHead.rows[0].cells].map(c => c.textContent.trim()) : [];
      const clipped = [...document.querySelectorAll('table.wfone td,table.wfone th')].filter(c => c.scrollWidth > c.clientWidth + 1).length;
      return { n: pages.length, tall: [...pages].some(s => s.scrollHeight > s.clientHeight + 2), rows, rr, head, clipped }; });
    const f = path.join(tmp, tag + hold + '.pdf'); await ip.pdf({ path: f, preferCSSPageSize: true, printBackground: true }); const info = cp.spawnSync('pdfinfo', [f]).stdout.toString(), pages = +(/Pages:\s+(\d+)/.exec(info) || [0, 0])[1], size = (/Page size:\s+(.*)/.exec(info) || [0, ''])[1];
    const total = D.rows.find(r => /^Total distributions/.test(r[0])), tiers = D.rows.filter(r => !/^Total distributions/.test(r[0])), dist = R.dist, lpd = D.rr.find(r => /^Distributed/.test(r[0]));
    const label = tag + (hold ? ' ' + hold + '-year' : '');
    check(label + ': one US Letter page, nothing clipped, the button is on the Equity Waterfall page', R.btn && D.n === 1 && !D.tall && pages === 1 && /612 x 792/.test(size) && D.clipped === 0 && p.errs.length === 0, JSON.stringify({ btn: R.btn, n: D.n, tall: D.tall, pages, size, clipped: D.clipped, errs: p.errs }));
    check(label + ': total distributions tie to the engine (to $1); LP + GP = total; the tiers add to the total', total && Math.abs(num(total[4]) - dist) < 1.01 && Math.abs(num(total[2]) + num(total[3]) - num(total[4])) < 1.5 && Math.abs(tiers.reduce((s, r) => s + num(r[4]), 0) - num(total[4])) < 1.5 && lpd && Math.abs(num(lpd[1]) - num(total[2])) < 1.5, JSON.stringify([total, dist, lpd]));
    if (hold) check(label + ': the partner cash flow table has Close, every year and a Total column', D.head[1] === 'Close' && D.head[D.head.length - 1] === 'Total' && D.head.length === hold + 3, JSON.stringify(D.head));
    await ctx.close();
  }
  console.log(checks + ' checks, ' + fails + ' failures'); await b.close(); fs.rmSync(tmp, { recursive: true, force: true }); process.exit(fails ? 1 : 0);
})();
