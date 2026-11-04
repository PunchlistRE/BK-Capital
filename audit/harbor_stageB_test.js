// Harbor Point regressions, stage B: validation and credit controls.
//  1 waterfall hurdles replay to their rates on the LP's dated cash flows (half a basis point)    2 contributions are gross and tie: LP + GP = equity ledger + operating shortfall
//  3 capitalised interest, sources = uses, draws, payoff, sale, IRR and multiple are independently recomputed and FAIL VISIBLY when the engine is tampered with
//  4 the credit gate follows the validation: hard failures cannot be approved, warnings cannot read "no material exceptions"
//  5 a second, independent model (audit/harbor/reference2.py, written from the raw inputs) matches the engine to the dollar
//   node audit/harbor_stageB_test.js index.html
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); const path = require('path'); const fs = require('fs'); const cp = require('child_process'); const os = require('os');
const H = require(path.join(__dirname, 'harbor', 'deal.js')), V = require(path.join(__dirname, 'devdeal.js')), A = require(path.join(__dirname, 'deal.js'));
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined }); let checks = 0, fails = 0;
  const check = (n, ok, d) => { checks++; if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? '  [' + String(d).slice(0, 280) + ']' : '')); };
  const open = async (deal) => { const p = await b.newPage({ viewport: { width: 1400, height: 900 } }); p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
    await p.route(/supabase\.co|vercel\.app|fonts\.g|cdn\.jsdelivr/, r => r.abort()); await p.goto('file://' + path.resolve(process.argv[2])); await p.waitForTimeout(700);
    await p.evaluate((d) => { document.documentElement.classList.add('bk-auth-ok'); bkCreateNewDeal(d); const s = bkLoad(); Object.assign(s, d); bkSave(s); }, deal); return p; };

  /* 1 hurdle replay */
  for (const [tag, deal] of [['Harbor Point (LP hurdles)', H], ['audit development deal (total-equity hurdles)', V], ['acquisition deal', A]]) {
    const p = await open(deal); const r = await p.evaluate(() => { const c = bkWaterfallChecks(); return { h: c.hurdles.map(h => [h.status, h.measured, h.target, h.cleared]), other: c.other.map(o => [o.id, o.status]), fail: c.fail }; });
    check(tag + ': every hurdle that was reached replays to its rate within 0.5 bp on the dated cash flows (one not reached stays below it)', r.h.every(h => h[0] === 'pass' && (!h[3] || Math.abs(h[1] - h[2]) <= 0.00005)), JSON.stringify(r.h.map(h => [h[0], (h[1] * 100).toFixed(4)])));
    check(tag + ': tier order, conservation, promote and categories all pass', r.other.every(o => o[1] === 'pass') && r.fail === 0, JSON.stringify(r.other));
    check(tag + ': no page errors', p.errs.length === 0, p.errs.join('|')); await p.close(); }
  /* the hurdle test is selectable for development deals and changes the waterfall; the default stays the legacy one */
  { const p = await open(Object.assign({}, H, { devHurdleBasis: 'deal' })); const a = await p.evaluate(() => ({ cv: bkConventions(bkLoad()).cvHurdleBasis, lp: bkWaterfallSummary().lp.irr })); await p.evaluate(() => { const s = bkLoad(); s.devHurdleBasis = 'lp'; bkSave(s); }); const c = await p.evaluate(() => ({ cv: bkConventions(bkLoad()).cvHurdleBasis, lp: bkWaterfallSummary().lp.irr }));
    check('development deals choose total-equity (default) or LP-dated hurdles, and the choice changes the LP result', a.cv === 'deal' && c.cv === 'lp' && Math.abs(a.lp - c.lp) > 1e-4, JSON.stringify([a, c])); await p.close(); }

  /* 2 contributions */
  { const p = await open(H); const r = await p.evaluate(() => { const m = bkMonthlyReturns(), w = bkWaterfallSummary(), f = bkDevFundingV10(), rows = m.rows;
      const eqCalled = rows.reduce((a, x) => a + x.equityDraw + x.refiEq, 0), con = rows.reduce((a, x) => a + x.wfContrib, 0), dist = rows.reduce((a, x) => a + x.wfDist, 0), netCon = rows.reduce((a, x) => a + Math.max(0, -x.cf), 0);
      return { eqCalled, con, dist, netCon, ledger: f.equityTotal, lp: w.lp.contributed, gp: w.gp.contributed, moic: m.moic, mDist: m.dist, mCon: m.contrib, lpShare: w.lp.contributed / (w.lp.contributed + w.gp.contributed) }; });
    check('Harbor Point: LP + GP contributions equal the contributions in the returns cash flow', Math.abs(r.lp + r.gp - r.con) < 2, r.lp + r.gp + ' vs ' + r.con);
    check('Harbor Point: contributions equal the equity ledger plus the operating shortfall the partners fund', Math.abs(r.eqCalled - r.ledger) < 2 && r.con >= r.eqCalled - 1, JSON.stringify([r.eqCalled, r.ledger, r.con]));
    check('Harbor Point: contributions are gross (not netted against same-month income)', r.con >= r.netCon - 1 && Math.abs(r.con - r.netCon) > 1, r.con + ' vs net ' + r.netCon);
    check('Harbor Point: multiple = total distributions / total contributions', Math.abs(r.moic - r.dist / r.con) < 1e-9 && Math.abs(r.mDist - r.dist) < 2 && Math.abs(r.mCon - r.con) < 2);
    check('Harbor Point: the LP funds 90% of every contribution', Math.abs(r.lpShare - 0.9) < 1e-9, r.lpShare); await p.close(); }

  /* 3 validation fails visibly when the engine is tampered with */
  const MUT = {
    'capitalised interest overstated in one month': () => { const o = window.bkDevFundingV10; window.bkDevFundingV10 = function () { const f = o.apply(this, arguments); f.months = f.months.map(z => z.mo === 12 ? Object.assign({}, z, { capInt: z.capInt + 5000 }) : z); return f; }; },
    'a loan draw that no cost needs': () => { const o = window.bkDevFundingV10; window.bkDevFundingV10 = function () { const f = o.apply(this, arguments); f.months = f.months.map(z => z.mo === 9 ? Object.assign({}, z, { loanDraw: z.loanDraw + 20000 }) : z); return f; }; },
    'equity requirement that does not match the cash flow': () => { const o = window.bkDevFundingV10; window.bkDevFundingV10 = function () { const f = o.apply(this, arguments); f.equityTotal += 25000; return f; }; },
    'sale proceeds that do not equal value less costs': () => { const o = window.bkMonthlyReturns; window.bkMonthlyReturns = function () { const m = o.apply(this, arguments); m.rows = m.rows.map((r, i) => i === m.rows.length - 1 ? Object.assign({}, r, { sale: r.sale + 40000 }) : r); return m; }; },
    'debt repaid at sale that is not the outstanding balance': () => { const o = window.bkMonthlyReturns; window.bkMonthlyReturns = function () { const m = o.apply(this, arguments); m.rows = m.rows.map((r, i) => i === m.rows.length - 1 ? Object.assign({}, r, { payoff: r.payoff - 30000 }) : r); return m; }; },
    'a reported IRR that the cash flows do not produce': () => { const o = window.bkMonthlyReturns; window.bkMonthlyReturns = function () { const m = o.apply(this, arguments); m.irr += 0.01; return m; }; },
    'an equity multiple that is not distributions over contributions': () => { const o = window.bkMonthlyReturns; window.bkMonthlyReturns = function () { const m = o.apply(this, arguments); m.moic += 0.05; return m; }; },
    'a waterfall that pays the LP too much': () => { const o = window.bkWaterfallV07; window.bkWaterfallV07 = function () { const w = o.apply(this, arguments); w.rows = w.rows.map((r, i) => i === w.rows.length - 1 ? Object.assign({}, r, { lpDist: r.lpDist + 100000 }) : r); return w; }; },
    'LP contributions that do not add up': () => { const o = window.bkWaterfallV07; window.bkWaterfallV07 = function () { const w = o.apply(this, arguments); w.lp = Object.assign({}, w.lp, { contrib: w.lp.contrib + 50000 }); return w; }; },
  };
  const WANT = { 'capitalised interest overstated in one month': 'capint', 'a loan draw that no cost needs': 'draws', 'equity requirement that does not match the cash flow': 'eqret', 'sale proceeds that do not equal value less costs': 'sale', 'debt repaid at sale that is not the outstanding balance': 'payoff', 'a reported IRR that the cash flows do not produce': 'irr', 'an equity multiple that is not distributions over contributions': 'moic', 'a waterfall that pays the LP too much': 'wf_', 'LP contributions that do not add up': 'contrib' };
  { const p = await open(H); const clean = await p.evaluate(() => { const g = bkIntegrity(); return { hard: g.hard.length, ids: g.checks.map(c => c.id), text: g.text }; });
    check('Harbor Point: an untouched engine has no failed integrity check', clean.hard === 0, clean.text); await p.close();
    for (const name of Object.keys(MUT)) { const q = await open(H); const r = await q.evaluate((src) => { eval('(' + src + ')')(); const g = bkIntegrity(), gate = bkDealGate(); return { hard: g.hard.map(c => c.id), verdict: gate.verdict, status: gate.status }; }, MUT[name].toString());
      check('tampered engine - ' + name + ': the check fails (hard)', r.hard.some(id => id.indexOf(WANT[name]) === 0) || (WANT[name] === 'wf_' && r.hard.some(id => /^wf_/.test(id))), JSON.stringify(r.hard));
      check('tampered engine - ' + name + ': the credit gate says HOLD, never APPROVE', r.verdict === 'HOLD' && /MODEL CHECK/.test(r.status) && !/NO MATERIAL/.test(r.status), r.verdict + ' | ' + r.status); await q.close(); } }

  /* 4 credit gate follows the validation */
  { const p = await open(H); const r = await p.evaluate(() => { const g = bkDealGate(), i = bkIntegrity(); return { verdict: g.verdict, status: g.status, action: g.action, warn: i.warn.length, hard: i.hard.length, pdf: bkReportHTML().replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ') }; });
    check('Harbor Point: with model warnings standing the gate is not APPROVE and does not say "no material exceptions"', r.warn > 0 && r.verdict !== 'APPROVE' && !/NO MATERIAL EXCEPTIONS/.test(r.status), r.verdict + ' | ' + r.status);
    check('Harbor Point: the warnings are named in the next step and in the PDF credit page', /Model warning/.test(r.pdf) && /Model integrity: /.test(r.pdf) && r.action.length > 20, r.action.slice(0, 120));
    await p.close(); }
  { const p = await open(A); const r = await p.evaluate(() => { const g = bkDealGate(), i = bkIntegrity(); return { verdict: g.verdict, status: g.status, hard: i.hard.length, warn: i.warn.length, na: i.na.map(c => c.id), text: i.text, gh: g.hard, gs: g.soft }; });
    check('acquisition deal: "no material exceptions" appears only when the gates and the model checks are all clean', !/NO MATERIAL EXCEPTIONS/.test(r.status) || (r.hard === 0 && r.warn === 0 && r.gh + r.gs === 0), r.status);
    check('acquisition deal: development-only checks are reported as not applicable, not passed', ['budget', 'capint', 'facility'].every(id => r.na.indexOf(id) >= 0), r.text); await p.close(); }
  { const p = await open(A); const r = await p.evaluate(() => { const o = window.bkWaterfallV07; window.bkWaterfallV07 = function () { const w = o.apply(this, arguments); w.rows = w.rows.map((r, i) => i === 5 ? Object.assign({}, r, { gpDist: r.gpDist + 1000 }) : r); return w; }; const g = bkDealGate(); return { v: g.verdict, s: g.status }; });
    check('acquisition deal: tampering with the waterfall also holds the gate', r.v === 'HOLD', r.v + ' | ' + r.s); await p.close(); }

  /* 5 independent second model */
  const FIG = [['unlev', 'unlev'], ['hard', 'hard'], ['soft', 'soft'], ['commit', 'commit'], ['upfront', 'upfront'], ['capInt', 'capInt'], ['excess', 'excess'], ['draws', 'draws'], ['equityTotal', 'equityTotal'], ['noi_pre', 'noi_pre'], ['grossSale', 'grossSale'], ['sale', 'sale'], ['payoff', 'payoff'], ['contrib', 'contrib'], ['dist', 'dist'], ['irr', 'irr'], ['uirr', 'uirr'], ['moic', 'moic'], ['lpIRR', 'lpIRR'], ['gpIRR', 'gpIRR'], ['lpDist', 'lpDist'], ['gpDist', 'gpDist'], ['promote', 'promote']];
  for (const [tag, deal] of [['Harbor Point', H], ['audit development deal (parametric budget, no takeout)', Object.assign({}, V, { refiAtStab: 0, devBudgetMode: 'PARAMETRIC', badDebtPct: 0 })]]) {
    const p = await open(deal); const app = await p.evaluate(() => { const f = bkDevFundingV10(), m = bkMonthlyReturns(), w = bkWaterfallSummary(), c = bkCalc(), x = bkDevV09(), last = m.rows[m.rows.length - 1];
      return { s: JSON.parse(JSON.stringify(bkLoad())), unlev: x.unlev, hard: x.hard, soft: x.soft, commit: f.commit, upfront: f.upfrontFees, capInt: f.actualCapInt, excess: f.months.reduce((a, z) => a + z.excess, 0), draws: f.months.reduce((a, z) => a + z.loanDraw, 0), equityTotal: f.equityTotal, noi_pre: c.noi, grossSale: last.grossSale, sale: last.sale, payoff: last.payoff, irr: m.irr, uirr: m.u.irr, contrib: m.contrib, dist: m.dist, moic: m.moic, lpIRR: w.lp.irr, gpIRR: w.gp.irr, lpDist: w.lp.dist, gpDist: w.gp.dist, promote: w.gp.promote }; });
    const f = path.join(os.tmpdir(), 'bk-ref-in-' + process.pid + '.json'); fs.writeFileSync(f, JSON.stringify(app.s)); let ref; try { ref = JSON.parse(cp.execSync('python3 ' + JSON.stringify(path.join(__dirname, 'harbor', 'reference2.py')) + ' ' + JSON.stringify(f)).toString()); } catch (e) { ref = null; } fs.unlinkSync(f);
    check(tag + ': the independent model ran', !!ref);
    if (ref) { const bad = FIG.filter(([a, r]) => { const x = app[a], y = ref[r]; return !(Math.abs(x - y) <= (Math.abs(x) > 100 ? 1 : 1e-7)); }); check(tag + ': ' + FIG.length + ' figures (cost, facility, interest, equity, sale, payoff, IRR, unlevered IRR, multiple, LP/GP IRR and distributions, promote) match the independent model to the dollar', bad.length === 0, bad.map(([a]) => a + ' ' + app[a] + ' vs ' + ref[a]).join('; ')); }
    await p.close(); }

  /* 6 the source discrepancies stay flagged */
  { const rep = fs.readFileSync(path.join(__dirname, 'harbor', 'REPORT.md'), 'utf8');
    check('the Harbor Point report still flags the brief\'s own errors (hard-cost total, weighted rent, rentable area, NOI target, soft-cost percentages)', ['24,950,000', '3,310', '105,900', '2,950,000', '0.98625'].every(t => rep.indexOf(t) >= 0 || rep.indexOf(t.replace(/,/g, '')) >= 0), rep.length); }

  console.log('harbor stage B: ' + checks + ' checks, ' + fails + ' failures'); await b.close(); process.exit(fails ? 1 : 0);
})();
