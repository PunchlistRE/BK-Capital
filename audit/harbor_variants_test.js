// Harbor Point: interest-reserve accounting and financing / reserve / waterfall variants, each reconciled to the independent model (audit/harbor/reference2.py).
//  1 interest paid from a reserve is not charged to equity again: equity in the returns cash flow = equity in the funding ledger, month by month, and a tampered engine that double-charges it fails the integrity check
//  2 variants: tight ceiling, no reserves, interest / held / operating reserves, LTC sizing, equity-first, no unused fee, alternative waterfalls
//   node audit/harbor_variants_test.js index.html
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); const path = require('path'); const fs = require('fs'); const cp = require('child_process'); const os = require('os');
const H = require(path.join(__dirname, 'harbor', 'deal.js')), B = require(path.join(__dirname, 'harbor', 'deal_brief.js'));
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined }); let checks = 0, fails = 0;
  const check = (n, ok, d) => { checks++; if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? '  [' + String(d).slice(0, 300) + ']' : '')); };
  const open = async (deal) => { const p = await b.newPage({ viewport: { width: 1400, height: 900 } }); p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
    await p.route(/supabase\.co|vercel\.app|fonts\.g|cdn\.jsdelivr/, r => r.abort()); await p.goto('file://' + path.resolve(process.argv[2])); await p.waitForTimeout(700);
    await p.evaluate((d) => { document.documentElement.classList.add('bk-auth-ok'); bkCreateNewDeal(d); const s = bkLoad(); Object.assign(s, d); bkSave(s); }, deal); return p; };
  const figures = () => { const f = bkDevFundingV10(), m = bkMonthlyReturns(), w = bkWaterfallSummary(), I = bkIntegrity(), ms = f.months, sum = (a, k) => a.reduce((x, z) => x + (z[k] || 0), 0);
    const per = ms.map((z, i) => Math.abs((z.eq + z.overflow + z.excess - (z.resInt || 0)) - m.rows[i].equityDraw)); const last = m.rows[m.rows.length - 1];
    return { s: JSON.parse(JSON.stringify(bkLoad())), commit: f.commit, capInt: f.actualCapInt, equityTotal: f.equityTotal, peak: Math.max.apply(null, ms.map(z => z.end)), excess: sum(ms, 'excess'), resInt: sum(ms, 'resInt'), resFunded: f.resFunded || 0,
      eqRows: sum(m.rows, 'equityDraw'), maxMonthGap: Math.max.apply(null, per), sale: last.sale, payoff: last.payoff, irr: m.irr, moic: m.moic, contrib: m.contrib, dist: m.dist, lpIRR: w.lp.irr, gpIRR: w.gp.irr, lpDist: w.lp.dist, gpDist: w.gp.dist, promote: w.gp.promote,
      hard: I.checks.filter(c => c.status === 'hard').map(c => c.id + ':' + c.label), wfFail: bkWaterfallChecks().fail }; };
  const ref = (s) => { const f = path.join(os.tmpdir(), 'bk-var-' + process.pid + '.json'); fs.writeFileSync(f, JSON.stringify(s)); try { return JSON.parse(cp.execSync('python3 ' + JSON.stringify(path.join(__dirname, 'harbor', 'reference2.py')) + ' ' + JSON.stringify(f)).toString()); } catch (e) { return null; } finally { fs.unlinkSync(f); } };
  const KEYS = ['commit', 'capInt', 'equityTotal', 'sale', 'payoff', 'irr', 'moic', 'contrib', 'dist', 'lpIRR', 'gpIRR', 'lpDist', 'gpDist', 'promote'];
  const diff = (a, r) => KEYS.filter(k => !(Math.abs(a[k] - r[k]) < (Math.abs(a[k]) > 100 ? 1 : 1e-6))).map(k => k + ' ' + a[k] + ' vs ' + r[k]).join('; ');
  const run = async (tag, deal) => { const p = await open(deal); const a = await p.evaluate(figures); const r = ref(a.s);
    check(tag + ': the independent model matches the engine (facility, capitalised interest, equity, sale, payoff, IRR, multiple, contributions, distributions, LP/GP, promote)', !!r && diff(a, r) === '', r ? diff(a, r) : 'reference failed');
    check(tag + ': no failed integrity check and every waterfall check passes', a.hard.length === 0 && a.wfFail === 0, a.hard.join('|') + ' wf ' + a.wfFail);
    check(tag + ': equity in the returns cash flow equals the funding ledger (total and month by month)', Math.abs(a.eqRows - a.equityTotal) < 1 && a.maxMonthGap < 0.01, a.eqRows + ' vs ' + a.equityTotal + ' / ' + a.maxMonthGap);
    check(tag + ': no page errors', p.errs.length === 0, p.errs.join('|')); await p.close(); return a; };

  /* 1 interest reserve */
  const IR = { name: 'Interest', amount: 1000000, at: 'close', use: 'interest' };
  const noRes = await run('ceiling $28M, no reserve', Object.assign({}, B, { conCeiling: 28000000, initReserves: [] }));
  const withRes = await run('ceiling $28M, $1.0M interest reserve', Object.assign({}, B, { conCeiling: 28000000, initReserves: [IR] }));
  check('interest beyond the ceiling is real in this case, and the reserve pays $1.0M of it (all of the reserve)', noRes.excess > 1e5 && Math.abs(withRes.resInt - 1000000) < 1 && withRes.excess > withRes.resInt, JSON.stringify([noRes.excess, withRes.excess, withRes.resInt]));
  check('the reserve is paid for once: partners fund the reserve and the interest beyond the reserve, not the reserved interest again', Math.abs((withRes.eqRows) - (withRes.equityTotal)) < 1 && withRes.resFunded === 1000000, JSON.stringify([withRes.eqRows, withRes.equityTotal, withRes.resFunded]));
  { const big = Object.assign({}, B, { conCeiling: 28000000, initReserves: [Object.assign({}, IR, { amount: 9000000 })] }); const a = await (async () => { const p = await open(big); const x = await p.evaluate(figures); await p.close(); return x; })();
    check('a reserve larger than the interest is used only up to the interest; the rest is released with the sale, never over-used', a.resInt <= a.excess + 1e-6 && a.resInt > 0 && a.hard.length === 0, JSON.stringify([a.resInt, a.excess])); }
  /* a tampered engine that charges the reserved interest to equity as well must fail visibly */
  { const p = await open(Object.assign({}, B, { conCeiling: 28000000, initReserves: [IR] })); const r = await p.evaluate(() => { const o = window.bkDevFundingV10; window.bkDevFundingV10 = function () { const f = o.apply(this, arguments); f.months = f.months.map(z => Object.assign({}, z, { resInt: 0 })); return f; };
      const g = bkIntegrity(); return { hard: g.hard.map(c => c.id), verdict: bkDealGate().verdict }; });
    check('tampered engine - reserve-paid interest charged to equity again: an integrity check fails (hard) and the credit gate says HOLD', r.hard.length > 0 && r.verdict === 'HOLD', JSON.stringify(r)); await p.close(); }

  /* 2 variants */
  await run('brief deal', B);
  await run('base deal (LTC sizing, no reserves, 2% contingency in the ladder)', H);
  await run('brief deal, interest reserve for the debt-service bucket', Object.assign({}, B, { initReserves: B.initReserves.map(r => r.name === 'Debt service / interest' ? Object.assign({}, r, { use: 'interest' }) : r) }));
  await run('brief deal, no reserves', Object.assign({}, B, { initReserves: [] }));
  await run('brief deal, ceiling $30M', Object.assign({}, B, { conCeiling: 30000000 }));
  await run('brief deal, equity first $10M and no unused fee', Object.assign({}, B, { conEquityFirst: 10000000, conUnusedFeePct: 0 }));
  await run('brief deal, preferred return shared (not LP only)', Object.assign({}, B, { prefLPOnly: 0 }));
  await run('brief deal, 100% catch-up', Object.assign({}, B, { gpCatchupRate: 1 }));
  await run('brief deal, 25% catch-up', Object.assign({}, B, { gpCatchupRate: 0.25 }));
  await run('brief deal, hurdles 10% / 15% / 20%', Object.assign({}, B, { pref: 0.10, hurdle2: 0.15, hurdle3: 0.20 }));
  await run('brief deal, 60/40 equity split', Object.assign({}, B, { gpShare: 0.4 }));
  await run('base deal with a fixed facility only', Object.assign({}, H, { conFixedAmt: 27300000, conCeiling: 34000000 }));
  await run('base deal with the brief\'s reserves only', Object.assign({}, H, { initReserves: B.initReserves }));
  console.log(checks + ' checks, ' + fails + ' failures'); await b.close(); process.exit(fails ? 1 : 0);
})();
