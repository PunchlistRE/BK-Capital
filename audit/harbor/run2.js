// Runs Harbor Point in BK Capital: base case, refinance alternative, every sensitivity in the brief. Writes audit/harbor/results.json
const { chromium } = require('playwright'); const path = require('path'); const fs = require('fs'); const D = require('./deal.js');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1400, height: 900 } }); p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
  await p.route(/supabase\.co|vercel\.app|fonts\.g|cdn\.jsdelivr/, r => r.abort()); await p.goto('file://' + path.resolve(__dirname, '../../index.html')); await p.waitForTimeout(700);
  const out = await p.evaluate((d) => {
    document.documentElement.classList.add('bk-auth-ok'); localStorage.setItem('bk-pt-all', '1'); bkCreateNewDeal(d); const s0 = bkLoad(); Object.assign(s0, d); bkSave(s0);
    const R = {};
    const metrics = () => { const o = {}; try {
      const m = bkMonthlyReturns(), f = bkDevFundingV10(), t = bkDevTakeoutV11(), w = bkWaterfallSummary(), last = m.rows[m.rows.length - 1], s = bkLoad();
      const yr = m.rows.slice(-12), noi12 = yr.reduce((a, r) => a + r.noi, 0), ds12 = yr.reduce((a, r) => a + r.ds, 0);
      const opDist = m.rows.reduce((a, r, i) => a + (i < m.rows.length - 1 ? Math.max(0, r.cf) : (r.noi - r.ds - r.reserve - r.assetFee)), 0);
      const bal = (t.conHeldToSale ? t.conHeldBalance : (t.permDebtAtSale || 0));
      Object.assign(o, { grossSale: last.grossSale, netSale: last.sale - last.dispoFee, payoff: last.payoff, profit: m.dist - m.contrib, contrib: m.contrib, dist: m.dist, uIRR: m.u && m.u.irr, uMOIC: m.u && m.u.moic, irr: m.irr, moic: m.moic,
        lpIRR: w && w.lp.irr, gpIRR: w && w.gp.irr, lpMOIC: w && w.lp.moic, gpMOIC: w && w.gp.moic, lpContrib: w && w.lp.contributed, gpContrib: w && w.gp.contributed, lpDist: w && w.lp.dist, gpDist: w && w.gp.dist, promote: w && w.gp.promote, lpPref: w && w.lp.pref, lpRoc: w && w.lp.roc, lpProfit: w && w.lp.profit, gpProfit: w && w.gp.profit,
        commit: f.commit, capInt: f.actualCapInt, upfront: f.upfrontFees, overflowEquity: f.overflowTotal, equityTotal: f.equityTotal, peakDebt: Math.max.apply(null, f.months.map(z => z.end)), levered: f.levered,
        dscr: ds12 ? noi12 / ds12 : null, noi12, ds12, breakEvenSale: (last.payoff + m.contrib - opDist) / (1 - Number(s.saleCostPct || 0)), hold: f.hold, stab: f.stab, excess: f.months.reduce((a, z) => a + (z.excess || 0), 0), unlev: f.unlev, hardTotal: f.hard, softTotal: f.soft, stabNOI: bkCalc().noi, capHeadroom: null, shortfall: f.overflowTotal });
    } catch (e) { o.err = e.message; } return o; };
    R.base = metrics();
    R.chk = (() => { try { const c = bkWaterfallChecks(); return { hurdles: c.hurdles.map(h => [h.name, h.status, h.detail]), other: c.other.map(h => [h.label, h.status, h.detail.slice(0, 200)]) }; } catch (e) { return e.message; } })();
    R.wf = (() => { try { return bkWaterfallSummary(); } catch (e) { return e.message; } })();
    R.readiness = (() => { try { const r = bkDealReadiness(); return { state: r.state, missing: r.missing.map(m => m.key) }; } catch (e) { return e.message; } })();
    // alternative: refinance at stabilization (month 43) — 65% LTV, 6.25%, 30 yr, 1% fee, retained
    const run = (ov, extra) => bkRunWith(ov, () => Object.assign(metrics(), extra ? extra() : {}));
    const stabLeft = 0;
    R.refi = bkRunWith({ refiAtStab: 1, permLTV: 0.65, permRate: 0.0625, permAmort: 30, permOrigFee: 0.01, permDSCR: 0, holdYears: 4 }, () => { const t = bkDevTakeoutV11(); return Object.assign(metrics(), { permLoan: t.permLoan, permFee: t.permFee, conPayoff: t.conPayoff, refiProceeds: t.refiProceeds, refiShortfall: t.refiShortfall, permPmt: t.permPmt, bindingTest: t.bindingTest, sizingNOI: t.noi, stabVal: t.stabVal, ltvCap: t.ltvCap, annualDS: t.permPmt * 12, dscrAtRefi: t.permPmt ? t.noi / (t.permPmt * 12) : null, debtYield: t.permLoan ? t.noi / t.permLoan : null, ltv: t.stabVal ? t.permLoan / t.stabVal : null, residualValue: t.stabVal }); });
    R.sens = {};
    const hold = (n) => (48 + n) / 12;
    const set = (name, rows) => { R.sens[name] = rows.map(([lab, ov]) => Object.assign({ label: lab }, run(ov))); };
    const base = bkLoad();
    set('Exit cap', [4.5, 4.75, 5, 5.25, 5.5, 5.75, 6].map(c => [c.toFixed(2) + '%', { exitCap: c / 100 }]));
    set('Average rent', [2800, 3000, 3310, 3500, 3700].map(r => ['$' + r, { avgRent: r }]));
    set('Construction cost', [0, 5, 10, 15, 20].map(c => ['+' + c + '%', { scnHardPct: c / 100 }]));
    set('Interest rate', [0, 100, 200, 300].map(c => ['+' + c + ' bps', { conRate: 0.0725 + c / 10000 }]));
    set('Construction delay', [0, 3, 6, 12].map(n => [n + ' months', { constructionMonths: 24 + n, holdYears: hold(n) }]));
    set('Lease-up delay', [0, 3, 6, 12].map(n => [n + ' months', { leaseupMonths: 17 + n, holdYears: hold(n) }]));
    set('Combined', [
      ['1. Cost +10%, rent -5%, cap +50 bps', { scnHardPct: 0.10, avgRent: 3310 * 0.95, exitCap: 0.055 }],
      ['2. Cost +15%, rate +200 bps, 6-mo construction delay', { scnHardPct: 0.15, conRate: 0.0925, constructionMonths: 30, holdYears: hold(6) }],
      ['3. Rent -10%, lease-up +6 mo, cap +100 bps', { avgRent: 3310 * 0.9, leaseupMonths: 23, holdYears: hold(6), exitCap: 0.06 }],
      ['4. Cost +20%, rate +300 bps, rent -10%, cap +100 bps', { scnHardPct: 0.20, conRate: 0.1025, avgRent: 3310 * 0.9, exitCap: 0.06 }]]);
    // concession scenario: one month free on new leases
    R.concession = run({ concessionLeaseUpPct: 1 / 12 });
    // rows for the reconciliation
    const m = bkMonthlyReturns(), f = bkDevFundingV10(); R.months = f.months.map(z => ({ mo: z.mo, land: z.land, hard: z.hard, soft: z.soft, lease: z.lease, fees: z.fees, need: z.need, eq: z.eq, loanDraw: z.loanDraw, capInt: z.capInt, end: z.end, overflow: z.overflow }));
    R.flows = m.rows.map(r => ({ m: r.m, cf: r.cf, eqDraw: r.eqDraw, noi: r.noi, ds: r.ds, sale: r.sale, payoff: r.payoff })); R.dev = { land: f.land, close: f.close, pre: f.pre, hard: f.hard, soft: f.soft, leaseDef: f.leaseDef, unlev: f.unlev, upfront: f.upfrontFees, estInt: f.estInt };
    R.calc = bkCalc(); R.keys = Object.keys(bkLoad()).length;
    R.integrity = (() => { const g = bkIntegrity(); return { text: g.text, checks: g.checks.map(c => [c.id, c.group, c.label, c.status, c.detail]) }; })();
    R.gate = (() => { const g = bkDealGate(); return { verdict: g.verdict, status: g.status, action: g.action }; })();
    R.inputs = JSON.parse(JSON.stringify(bkLoad())); return R; }, D);
  fs.writeFileSync(path.join(__dirname, 'inputs.json'), JSON.stringify(out.inputs)); delete out.inputs;
  fs.writeFileSync(path.join(__dirname, 'results.json'), JSON.stringify(out, null, 1)); console.log('errs', p.errs); console.log(JSON.stringify(out.base)); console.log(JSON.stringify(out.refi)); await b.close();
})();
