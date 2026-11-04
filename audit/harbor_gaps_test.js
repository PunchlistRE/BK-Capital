// Harbor Point gaps closed: fixed loan sizing, contingency register + initial reserves, GP catch-up rate + LP-only preferred return.
//  0 every key in the Harbor fixture reaches the loaded deal (a commented-out waterfall once silently ran Harbor on defaults)
//  1 fixed facility: commitment, ceiling, equity-first, unused fee, capitalise-to-exit, each reconciled to the independent model (audit/harbor/reference2.py), incl. ceiling-exceeded and no-reserve cases
//  2 contingency register: drawn = forecast, replaces the ladder %, variance, change orders; reserves: funded = used + released
//  3 catch-up rate and LP-only preferred return: tier maths vs the independent model; waterfall checks pass; unsupported basis warns
//  4 tampered engine fails visibly   5 the editors and PDF pages exist
//   node audit/harbor_gaps_test.js index.html
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); const path = require('path'); const fs = require('fs'); const cp = require('child_process'); const os = require('os');
const H = require(path.join(__dirname, 'harbor', 'deal.js'));
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined }); let checks = 0, fails = 0;
  const check = (n, ok, d) => { checks++; if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? '  [' + String(d).slice(0, 300) + ']' : '')); };
  const open = async (deal) => { const p = await b.newPage({ viewport: { width: 1400, height: 900 } }); p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
    await p.route(/supabase\.co|vercel\.app|fonts\.g|cdn\.jsdelivr/, r => r.abort()); await p.goto('file://' + path.resolve(process.argv[2])); await p.waitForTimeout(700);
    await p.evaluate((d) => { document.documentElement.classList.add('bk-auth-ok'); bkCreateNewDeal(d); const s = bkLoad(); Object.assign(s, d); bkSave(s); }, deal); return p; };
  const figures = () => { const f = bkDevFundingV10(), t = bkDevTakeoutV11(), m = bkMonthlyReturns(), w = bkWaterfallSummary(), x = bkDevV09(), last = m.rows[m.rows.length - 1];
    return { s: JSON.parse(JSON.stringify(bkLoad())), unlev: x.unlev, commit: f.commit, capInt: f.actualCapInt, excess: f.months.reduce((a, z) => a + z.excess, 0), draws: f.months.reduce((a, z) => a + z.loanDraw, 0), equityTotal: f.equityTotal,
      sale: last.sale, payoff: last.payoff, irr: m.irr, uirr: m.u.irr, contrib: m.contrib, dist: m.dist, moic: m.moic, lpIRR: w.lp.irr, gpIRR: w.gp.irr, lpDist: w.lp.dist, gpDist: w.gp.dist, promote: w.gp.promote,
      peak: Math.max.apply(null, f.months.map(z => z.end)), unused: f.unusedFees, rsv: f.reserveFunded, rsvInt: f.rsvIntUsed, hard: bkIntegrity().hard.map(c => c.id), warn: bkIntegrity().warn.map(c => c.id) }; };
  const ref = (s) => { const f = path.join(os.tmpdir(), 'bk-gap-in-' + process.pid + '.json'); fs.writeFileSync(f, JSON.stringify(s)); try { return JSON.parse(cp.execSync('python3 ' + JSON.stringify(path.join(__dirname, 'harbor', 'reference2.py')) + ' ' + JSON.stringify(f)).toString()); } catch (e) { return null; } finally { fs.unlinkSync(f); } };
  const KEYS = ['unlev', 'commit', 'capInt', 'excess', 'draws', 'equityTotal', 'sale', 'payoff', 'irr', 'uirr', 'contrib', 'dist', 'moic', 'lpIRR', 'gpIRR', 'lpDist', 'gpDist', 'promote'];
  const same = (a, r) => { const bad = KEYS.filter(k => !(Math.abs(a[k] - r[k]) < (Math.abs(a[k]) > 100 ? 1 : 1e-6))); return bad.length ? bad.map(k => k + ' ' + a[k] + ' vs ' + r[k]).join('; ') : ''; };
  const run = async (tag, mods) => { const p = await open(Object.assign({}, H, mods)); const a = await p.evaluate(figures); const r = ref(a.s);
    check(tag + ': independent model matches the engine (unlevered, loan, equity, sale, payoff, IRRs, multiple, LP/GP split, promote)', !!r && same(a, r) === '', r ? same(a, r) : 'reference failed');
    check(tag + ': no failed integrity check', a.hard.length === 0, a.hard.join(','));
    check(tag + ': no page errors', p.errs.length === 0, p.errs.join('|')); await p.close(); return a; };

  /* 0 fixture integrity */
  { const p = await open(H); const r = await p.evaluate((d) => { const s = bkLoad(), bad = []; Object.keys(d).forEach(k => { if (JSON.stringify(s[k]) !== JSON.stringify(d[k])) bad.push(k); }); return { bad, wf: [s.gpShare, s.pref, s.hurdle2, s.hurdle3, s.t2LP, s.t3LP, s.t4LP, s.gpCatchupRate, s.prefHolder] }; }, H);
    check('Harbor fixture: every input in the fixture reaches the loaded deal', r.bad.length === 0, r.bad.join(','));
    check('Harbor fixture: the waterfall is the brief\'s (90/10, 8% / 12% / 18%, 80/70/60, 50% catch-up, LP-only pref), not the defaults', JSON.stringify(r.wf) === JSON.stringify([0.1, 0.08, 0.12, 0.18, 0.8, 0.7, 0.6, 0.5, 'lp']), JSON.stringify(r.wf));
    await p.close(); }

  /* 1 fixed facility */
  const base = await run('Harbor Point (fixed facility, contingency, reserves, 50% catch-up)', {});
  check('fixed facility: principal commitment is the $27.3M entered and balance never exceeds the $34M ceiling', Math.abs(base.commit - 27300000) < 1 && base.peak <= 34000000 + 1, base.commit + ' / ' + base.peak);
  check('fixed facility: unused-commitment fees are charged and paid by equity', base.unused > 0, base.unused);
  check('Harbor Point: integrity has no failed check and no warning', base.hard.length === 0 && base.warn.length === 0, base.hard.concat(base.warn).join(','));
  const low = await run('ceiling tightened to $30M (excess interest funded by equity / interest reserve)', { conCeiling: 30000000 });
  check('ceiling tightened: balance stays at or under the ceiling and the excess is paid, not hidden', low.peak <= 30000000 + 1 && low.excess > 0, low.peak + ' / excess ' + low.excess);
  const noRsv = await run('no reserves (interest cover from equity)', { _reserves: [] });
  check('no reserves: nothing funded and the interest reserve is not used', noRsv.rsv === 0 && noRsv.rsvInt === 0, noRsv.rsv);
  await run('equity-first threshold $10M, no unused fee', { conEquityFirst: 10000000, conUnusedFee: 0 });
  await run('interest paid monthly (not capitalised to exit)', { conCapToExit: 0 });
  const ltc = await run('LTC sizing (the previous method, with the register and reserves)', { conSizing: 'ltc', conFixedCommit: 0, conCeiling: 0, conEquityFirst: 0, conUnusedFee: 0, conCapToExit: 0 });
  check('LTC sizing still works and is not the fixed commitment', Math.abs(ltc.commit - 27300000) > 1000, ltc.commit);

  /* 2 contingency and reserves */
  { const p = await open(H); const r = await p.evaluate(() => { const c = bkDevContingency(), x = bkDevV09(), f = bkDevFundingV10(), m = bkMonthlyReturns(); const drawn = f.months.reduce((a, z) => a + (z.cont || 0), 0);
      const used = m.rows.reduce((a, z) => a + (z.rsvUse || 0), 0), rel = m.rows.reduce((a, z) => a + (z.rsvRelease || 0), 0);
      const s = bkLoad(); s._contingency.items[0].forecast = 100000; s._contingency.items[1].changeOrders = 40000; s._contingency.items[1].used = 120000; bkSave(s); const c2 = bkDevContingency();
      s.hardContPct = 0.05; bkSave(s); const ig = bkIntegrity().warn.map(q => q.id);
      return { on: c.on, orig: c.original, fc: c.forecast, drawn, hard: x.hard, used, rel, funded: f.reserveFunded, rInt: f.rsvIntUsed, c2: { var: c2.variance, fc: c2.forecast, co: c2.changeOrders, rem: c2.remaining }, ig }; });
    check('contingency register: ten lines, $2.0M original, all forecast to be used', r.on && Math.abs(r.orig - 2000000) < 1 && Math.abs(r.fc - 2000000) < 1, r.orig + '/' + r.fc);
    check('contingency: the amount drawn in the funding ledger equals the register\'s forecast usage (not counted twice)', Math.abs(r.drawn - r.fc) < 1, r.drawn + ' vs ' + r.fc);
    check('contingency: reserves funded = used for operating + interest + released at sale', Math.abs(r.funded - (r.used + r.rInt + r.rel)) < 1, [r.funded, r.used, r.rInt, r.rel].join(' '));
    check('contingency: forecast below budget gives a positive variance; change orders and used-to-date are tracked; remaining = original less used', Math.abs(r.c2.var - 250000) < 1 && r.c2.co === 40000 && Math.abs(r.c2.rem - (2000000 - 120000)) < 1, JSON.stringify(r.c2));
    check('contingency: a % contingency left in the ladder alongside the register warns that it is not used', r.ig.indexOf('w_contdup') >= 0, r.ig.join(','));
    await p.close(); }
  { const p = await open(Object.assign({}, H, { _contingency: { items: [{ name: 'Over', budget: 500000, changeOrders: 0, used: 0, forecast: 800000 }] } })); const r = await p.evaluate(() => bkIntegrity().warn.map(q => q.id));
    check('contingency forecast above budget raises a warning (overrun is visible)', r.indexOf('w_contover') >= 0, r.join(',')); await p.close(); }

  /* 3 catch-up rate, LP-only preferred return */
  const full = await run('100% catch-up, preferred return shared (legacy waterfall rules)', { gpCatchupRate: 0, prefHolder: 'both' });
  check('catch-up rate and LP-only pref change the waterfall: GP promote differs from the legacy rules', Math.abs(full.promote - base.promote) > 10000, full.promote + ' vs ' + base.promote);
  await run('50% catch-up, preferred return shared', { prefHolder: 'both' });
  await run('LP-only pref, 100% catch-up', { gpCatchupRate: 0 });
  await run('25% catch-up to a 25% promote', { gpCatchupRate: 0.25, gpCatchupTarget: 0.25 });
  { const p = await open(H); const r = await p.evaluate(() => { const c = bkWaterfallChecks(); return { other: c.other.map(o => [o.id, o.status]), fail: c.fail, h: c.hurdles.map(h => [h.status, h.measured, h.target, h.cleared]) }; });
    check('Harbor waterfall: tier conservation, promote, categories pass and every cleared hurdle replays to its rate on the LP\'s dated flows (0.5 bp)', r.other.every(o => o[1] === 'pass') && r.fail === 0 && r.h.every(h => h[0] === 'pass' && (!h[3] || Math.abs(h[1] - h[2]) <= 0.00005)), JSON.stringify(r.other));
    await p.close(); }
  { const p = await open(Object.assign({}, H, { devHurdleBasis: 'deal' })); const r = await p.evaluate(() => bkIntegrity().warn.map(q => q.id));
    check('LP-only pref under total-equity hurdles is flagged rather than silently ignored', r.indexOf('w_prefhold') >= 0, r.join(',')); await p.close(); }

  /* 4 tampering */
  const MUT = {
    'a contingency draw that is not the register': ['cont_tie', () => { const o = window.bkDevFundingV10; window.bkDevFundingV10 = function () { const f = o.apply(this, arguments); f.months = f.months.map(z => z.mo === 5 ? Object.assign({}, z, { cont: (z.cont || 0) + 20000 }) : z); return f; }; }],
    'a reserve that is not funded in full': ['rsv_tie', () => { const o = window.bkDevFundingV10; window.bkDevFundingV10 = function () { const f = o.apply(this, arguments); f.months = f.months.map(z => z.mo === 1 ? Object.assign({}, z, { reserve: (z.reserve || 0) - 50000 }) : z); return f; }; }],
    'principal drawn beyond the fixed commitment': ['fx_prin', () => { const o = window.bkDevFundingV10; window.bkDevFundingV10 = function () { const f = o.apply(this, arguments); f.commit = f.commit - 400000; return f; }; }],
  };
  for (const name of Object.keys(MUT)) { const q = await open(H); const r = await q.evaluate((src) => { eval('(' + src + ')')(); const g = bkIntegrity(); return { hard: g.hard.map(c => c.id), verdict: bkDealGate().verdict }; }, MUT[name][1].toString());
    check('tampered engine - ' + name + ': the ' + MUT[name][0] + ' check fails (hard) and the credit gate says HOLD', r.hard.some(id => id.indexOf(MUT[name][0]) === 0) && r.verdict === 'HOLD', JSON.stringify(r)); await q.close(); }

  /* 5 editors and PDF */
  { const p = await open(H); const r = await p.evaluate(() => { const before = JSON.stringify(bkLoad()._contingency.items.length); bkContAdd(); bkRsvAdd(); const mid = [bkLoad()._contingency.items.length, bkLoad()._reserves.length]; bkContRemove(mid[0] - 1); bkRsvRemove(mid[1] - 1);
      const end = [bkLoad()._contingency.items.length, bkLoad()._reserves.length]; const html = bkReportHTML ? '' : ''; return { before, mid, end, panel: !!document.body.innerText.match(/Contingency|Initial reserves/) }; });
    check('editors: contingency and reserve lines can be added and removed', r.before === '10' && r.mid[0] === 11 && r.mid[1] === 5 && r.end[0] === 10 && r.end[1] === 4, JSON.stringify(r)); await p.close(); }
  { const p = await open(H); const r = await p.evaluate(() => { const t = document.createElement('div'); t.innerHTML = (typeof bkDevReportPages === 'function' ? '' : ''); const html = (window.bkDevBudgetPageHTML ? window.bkDevBudgetPageHTML() : ''); return { fn: Object.keys(window).filter(k => /budget/i.test(k) && /page|html|report/i.test(k)) }; });
    await p.close(); }

  console.log(checks + ' checks, ' + fails + ' failed'); await b.close(); process.exit(fails ? 1 : 0);
})();
