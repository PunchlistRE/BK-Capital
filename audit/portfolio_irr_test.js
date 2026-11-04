// Portfolio levered IRR on the combined dated cash flow (never an average of deal IRRs), checked against an independent XIRR written here in Python.
//   node audit/portfolio_irr_test.js index.html
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); const path = require('path'); const cp = require('child_process');
const A = require(path.join(__dirname, 'deal.js')), B = require(path.join(__dirname, 'dealB.js')), V = require(path.join(__dirname, 'devdeal.js'));
/* independent: rebuild each deal's dated net flows from its own engine vectors (acquisition: xirrValues / xirrDates; development: values with the closing equity moved to the closing date),
   merge them by date, and solve the XIRR by bisection on actual days / 365 */
const PY = String.raw`
import json, sys, datetime as dt
D = json.load(sys.stdin)
def solve(fl):
    fl = sorted(fl); t0 = fl[0][0]
    f = lambda r: sum(v / (1 + r) ** ((d - t0).days / 365.0) for d, v in fl)
    lo, hi = -0.99, 10.0
    if f(lo) * f(hi) > 0: return None
    for _ in range(300):
        mid = (lo + hi) / 2
        if f(lo) * f(mid) <= 0: hi = mid
        else: lo = mid
    return (lo + hi) / 2
def flows(x):
    p = lambda s: dt.date.fromisoformat(s[:10])
    if x['xv']: return [(p(d), v) for d, v in zip(x['xd'], x['xv'])]
    out = [(p(x['close']), -x['eq0'])] if x['eq0'] else []
    for i, (d, v) in enumerate(zip(x['dates'], x['values'])): out.append((p(d), v + (x['eq0'] if i == 0 else 0)))
    return out
merged = {}
for x in D:
    for d, v in flows(x): merged[d] = merged.get(d, 0) + v
print(json.dumps({'each': [solve(flows(x)) for x in D], 'all': solve(list(merged.items())), 'n': len(merged)}))
`;
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined }); const p = await b.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route(/supabase\.co|vercel\.app|fonts\.g|cdn\.jsdelivr/, r => r.abort()); await p.goto('file://' + path.resolve(process.argv[2])); await p.waitForTimeout(700);
  let checks = 0, fails = 0; const check = (n, ok, d) => { checks++; if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? '  [' + String(d).slice(0, 300) + ']' : '')); };
  await p.evaluate(() => document.documentElement.classList.add('bk-auth-ok'));
  /* three saved deals on different dates: an acquisition, the same building's upside case closing six months later, and a development */
  const snaps = await p.evaluate(([a, bb, v]) => { const out = []; for (const d of [a, Object.assign({}, bb, { closing: '7/1/2027' }), v]) { bkCreateNewDeal(d); const s = bkLoad(); Object.assign(s, d); bkSave(s); out.push(JSON.parse(JSON.stringify(bkLoad()))); } return out; }, [A, B, V]);
  const run = (list) => p.evaluate((L) => { bkPortfolioSave(L); const c = bkPortfolioConsolidated(L);
    const raw = L.map(sn => { const r = bkPortfolioMonthlyFor(sn).r; return { irr: r.irr, contrib: r.contrib, dist: r.dist, equity: bkPortfolioMetricsFor(sn).equity, xv: r.xirrValues || null, xd: (r.xirrDates || []).map(d => new Date(d).toISOString()), values: r.values, dates: r.dates.map(d => new Date(d).toISOString()), close: new Date(r.closeDt).toISOString(), eq0: Number(r.rows[0].eqDraw) || 0 }; });
    return { irr: c.irr, available: c.available, reason: c.reason, contrib: c.contrib, dist: c.dist, moic: c.moic, reconciles: c.reconciles, deals: c.deals.map(d => ({ name: d.name, irr: d.irr, own: d.ownIRR, ties: d.ties })), excluded: c.excluded, raw, text: bkPortfolioIRRText(c) }; }, list);
  const py = (raw) => { const r = cp.spawnSync('python3', ['-c', PY], { input: JSON.stringify(raw) }); if (r.status) throw new Error(String(r.stderr)); return JSON.parse(String(r.stdout)); };

  const all = await run(snaps), ref = py(all.raw);
  check('every deal\'s dated flows reproduce its own engine IRR (to 1e-6) and its own contributions and distributions', all.deals.length === 3 && all.deals.every(d => d.ties), JSON.stringify(all.deals));
  check('independent XIRR of each deal (rebuilt from the engine\'s own IRR vectors) equals the deal\'s IRR', ref.each.every((r, i) => Math.abs(r - all.raw[i].irr) < 1e-6), JSON.stringify([ref.each, all.raw.map(r => r.irr)]));
  check('portfolio IRR equals an independent XIRR of the merged dated flows (to 1e-6)', all.available && Math.abs(all.irr - ref.all) < 1e-6, JSON.stringify([all.irr, ref.all]));
  const wavg = all.raw.reduce((a, r) => a + r.irr * r.equity, 0) / all.raw.reduce((a, r) => a + r.equity, 0);
  check('the portfolio IRR is not the equity-weighted average of deal IRRs (they differ on this portfolio)', Math.abs(wavg - all.irr) > 1e-4, JSON.stringify([wavg, all.irr]));
  check('combined contributions and distributions equal the sum of the deals\', gross, and the multiple is distributions / contributions', all.reconciles && Math.abs(all.contrib - all.raw.reduce((a, r) => a + r.contrib, 0)) < 1 && Math.abs(all.dist - all.raw.reduce((a, r) => a + r.dist, 0)) < 1 && Math.abs(all.moic - all.dist / all.contrib) < 1e-12);
  for (let i = 0; i < 3; i++) { const one = await run([snaps[i]]); check('a one-deal portfolio has that deal\'s IRR: ' + snaps[i].name, Math.abs(one.irr - one.raw[0].irr) < 1e-7, JSON.stringify([one.irr, one.raw[0].irr])); }
  { const twin = Object.assign(JSON.parse(JSON.stringify(snaps[0])), { dealId: 'TWIN', name: 'Twin, a year later', closing: '1/1/2028' }); const r = await run([snaps[0], twin]);
    const lo = Math.min(r.raw[0].irr, r.raw[1].irr), hi = Math.max(r.raw[0].irr, r.raw[1].irr);
    check('the same deal twice, a year apart: the portfolio IRR lies between the two deals\' own IRRs (which differ only by the day count of their dates)', r.irr >= lo - 1e-9 && r.irr <= hi + 1e-9 && hi - lo < 1e-3, JSON.stringify([r.irr, r.raw.map(x => x.irr)])); }
  /* unavailable, never a silent number */
  { const r = await run([]); check('an empty portfolio shows the IRR as Unavailable with the reason', !r.available && r.text === 'Unavailable' && /No deals/.test(r.reason)); }
  { const r = await p.evaluate((L) => { const o = window.bkPortfolioMonthlyFor; window.bkPortfolioMonthlyFor = function(sn){ return sn.dealId === 'TEST-002' ? { ok: false, error: 'test failure' } : o(sn); }; try { bkPortfolioSave(L); const c = bkPortfolioConsolidated(L.concat([])); return { a: c.available, t: bkPortfolioIRRText(c), reason: c.reason }; } finally { window.bkPortfolioMonthlyFor = o; } }, snaps.map((s, i) => i === 1 ? Object.assign({}, s, { name: s.name + ' ' }) : s));
    check('a deal the engine cannot run makes the portfolio IRR Unavailable and is named, rather than being dropped from a number', !r.a && r.t === 'Unavailable' && /Upside/.test(r.reason), JSON.stringify(r)); }
  /* the pages */
  await p.evaluate((L) => { bkPortfolioSave(L); }, snaps);
  const want = await p.evaluate(() => bkPct(bkPortfolioConsolidated().irr));
  for (const sh of ['Portfolio', 'Portfolio Dashboard', 'Portfolio Rollup', 'Portfolio M']) {
    const t = await p.evaluate((n) => { showSheet(n); return document.querySelector('#viewport').innerText + ' ' + (document.querySelector('.sidebar, #sidebar') || { innerText: '' }).innerText; }, sh);
    check(sh + ': shows the portfolio IRR on the combined dated cash flow (' + want + ') and no equity-weighted IRR', t.includes(want) && /combined dated cash flow|XIRR of the dated flows|Portfolio IRR/.test(t) && !/Equity-Weighted Levered IRR|Equity-Wtd|Wtd\. IRR|Equity-Weighted MOIC/i.test(t), sh);
  }
  const rec = await p.evaluate(() => { showSheet('Portfolio M'); const t = document.getElementById('pc-recon'), f = document.getElementById('pc-flows'); return { rows: t ? t.tBodies[0].rows.length : 0, ties: t ? (t.innerText.match(/Ties/gi) || []).length : 0, flows: !!f, bad: /undefined|NaN/.test(document.querySelector('#viewport').innerText) }; });
  check('Portfolio M lists each deal\'s reconciliation (three deals and the sum, all tie) and the dated contributions and distributions by year', rec.flows && rec.rows === 4 && rec.ties === 4 && !rec.bad, JSON.stringify(rec));
  check('no page errors', errs.length === 0, errs.join(' | '));
  console.log(checks + ' checks, ' + fails + ' failures'); await b.close(); process.exit(fails ? 1 : 0);
})();
