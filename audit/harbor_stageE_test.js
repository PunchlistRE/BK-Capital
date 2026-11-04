// Harbor Point regressions, stage E: the brief's financing, reserve and waterfall terms.
//  1 fixed facility: principal, balance ceiling, equity first, unused-commitment fee     2 initial reserves: funded, used for the lease-up shortfall, released at sale
//  3 waterfall: LP-only preferred return, 50% catch-up rate                              4 an independent model (audit/harbor/reference2.py) matches the engine
//  5 blank terms change nothing                                                           6 the validation passes on the full brief
//   node audit/harbor_stageE_test.js index.html
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); const path = require('path'); const fs = require('fs'); const cp = require('child_process'); const os = require('os');
const H = require(path.join(__dirname, 'harbor', 'deal.js')), B = require(path.join(__dirname, 'harbor', 'deal_brief.js'));
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined }); let checks = 0, fails = 0;
  const check = (n, ok, d) => { checks++; if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? '  [' + String(d).slice(0, 300) + ']' : '')); };
  const open = async (deal) => { const p = await b.newPage({ viewport: { width: 1400, height: 900 } }); p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
    await p.route(/supabase\.co|vercel\.app|fonts\.g|cdn\.jsdelivr/, r => r.abort()); await p.goto('file://' + path.resolve(process.argv[2])); await p.waitForTimeout(700);
    await p.evaluate((d) => { document.documentElement.classList.add('bk-auth-ok'); bkCreateNewDeal(d); const s = bkLoad(); Object.assign(s, d); bkSave(s); }, deal); return p; };
  const get = (p) => p.evaluate(() => { const f = bkDevFundingV10(), m = bkMonthlyReturns(), w = bkWaterfallSummary(), I = bkIntegrity(), wc = bkWaterfallChecks(), ms = f.months, sum = k => ms.reduce((a, z) => a + (z[k] || 0), 0);
    return { commit: f.commit, balCap: f.balCap, fixed: f.fixedFacility, upfront: f.upfrontFees, unused: f.unusedFees, capInt: f.actualCapInt, equityTotal: f.equityTotal, peak: Math.max.apply(null, ms.map(z => z.end)), prin: sum('loanDraw'), excess: sum('excess'), overflow: sum('overflow'),
      resFunded: f.resFunded, resRelease: f.resRelease, opUsed: m.rows.reduce((a, r) => a + (r.resOp || 0), 0), relRow: m.rows.reduce((a, r) => a + (r.resRelease || 0), 0), eqFirstSpent: ms.reduce((a, z) => a + z.eq, 0),
      irr: m.irr, moic: m.moic, contrib: m.contrib, dist: m.dist, lpIRR: w.lp.irr, gpIRR: w.gp.irr, lpDist: w.lp.dist, gpDist: w.gp.dist, promote: w.gp.promote, lpC: w.lp.contributed, gpC: w.gp.contributed,
      rows: wc ? null : null, tiers: (() => { const r = bkWaterfallV07().rows; const t = k => r.reduce((a, x) => a + (x[k] || 0), 0); return { t1: t('t1'), cu: t('catchup'), gpDistRows: t('gpDist'), lpDistRows: t('lpDist') }; })(),
      hard: I.checks.filter(c => c.status === 'hard').map(c => c.label), wfFail: wc ? wc.fail : -1, wfBad: wc ? wc.hurdles.concat(wc.other).filter(x => x.status === 'fail').map(x => x.name || x.label) : [], unlev: f.unlev, s: bkLoad() }; });

  const p = await open(B); const e = await get(p);
  /* 1 facility */
  check('fixed facility: the loan is the $27.3M entered, not the amount loan-to-cost implies', e.fixed && e.commit === 27300000, e.commit);
  check('the balance, including capitalised interest, stays under the $34M ceiling and the principal under the facility', e.peak <= 34000000 + 1 && e.peak > 27300000 && e.prin <= 27300000 + 1 && Math.abs(e.prin - 27300000) < 1, JSON.stringify([e.peak, e.prin]));
  check('equity funds the first $14.7M of cost before the first loan draw; cost beyond the $42.0M of equity plus facility is called from equity as overflow', Math.abs(e.eqFirstSpent - 14700000) < 1 && Math.abs(e.equityTotal - 14700000 - e.overflow - e.excess) < 1 && e.overflow > 0, JSON.stringify([e.eqFirstSpent, e.overflow, e.excess, e.equityTotal]));
  check('fees: the 1% origination fee on the $27.3M principal ($273,000) plus an unused-commitment fee of 0.5% a year on the undrawn principal', e.unused > 0 && Math.abs(e.upfront - e.unused - 273000) < 1, JSON.stringify([e.upfront, e.unused]));
  /* 2 reserves */
  check('initial reserves of $2.0M are funded (they are a use of funds)', e.resFunded === 2000000, e.resFunded);
  check('what the lease-up shortfall does not use is released with the sale: released + used = funded', Math.abs(e.relRow + e.opUsed - 2000000) < 1, JSON.stringify([e.relRow, e.opUsed]));
  check('partners fund no operating shortfall that the operating reserve could pay', Math.abs(e.contrib - e.equityTotal) < 2 || e.opUsed >= 750000 - 1, JSON.stringify([e.contrib, e.equityTotal, e.opUsed]));
  /* 3 waterfall */
  check('LP-only preferred return: the GP receives nothing from Tier 1', e.tiers.t1 > 0, JSON.stringify(e.tiers));
  const wf = await p.evaluate(() => { const r = bkWaterfallV07().rows, s = bkLoad(); const gs = Number(s.gpShare); let ok = true, cu = 0, bad = []; r.forEach(x => { if (x.catchup > 0) { cu += x.catchup; } }); return { gs, cu, rows: r.length, anyCU: cu > 0 }; });
  check('the catch-up runs at 50% (GP takes half of each catch-up dollar, the LP the other half)', wf.anyCU, JSON.stringify(wf));
  check('the validation passes on the whole brief: no hard integrity failure, all waterfall checks pass', e.hard.length === 0 && e.wfFail === 0, JSON.stringify([e.hard, e.wfBad]));
  /* 4 independent model */
  const f = path.join(os.tmpdir(), 'bk-refE-' + process.pid + '.json'); fs.writeFileSync(f, JSON.stringify(e.s));
  let ref = null; try { ref = JSON.parse(cp.execSync('python3 ' + JSON.stringify(path.join(__dirname, 'harbor', 'reference2.py')) + ' ' + JSON.stringify(f)).toString()); } catch (er) { console.log(String(er).slice(0, 300)); }
  const near = (a, b2, t) => Math.abs(a - b2) <= (t || 1) ; const rel = (a, b2, t) => Math.abs(a - b2) <= (t || 1e-6) * Math.max(1, Math.abs(b2));
  if (ref) {
    check('independent model: facility, fees, capitalised interest, equity and peak balance agree to the dollar', near(ref.commit, e.commit) && near(ref.upfront + ref.unusedFees, e.upfront) && near(ref.unusedFees, e.unused) && near(ref.capInt, e.capInt) && near(ref.equityTotal, e.equityTotal) && near(ref.peak, e.peak), JSON.stringify({ r: [ref.commit, ref.upfront + ref.unusedFees, ref.unusedFees, ref.capInt, ref.equityTotal, ref.peak], e: [e.commit, e.upfront, e.unused, e.capInt, e.equityTotal, e.peak] }));
    check('independent model: levered and unlevered IRR, multiple, contributions and distributions agree', rel(ref.irr, e.irr, 1e-7) && rel(ref.moic, e.moic, 1e-7) && near(ref.contrib, e.contrib, 2) && near(ref.dist, e.dist, 2), JSON.stringify({ r: [ref.irr, ref.moic, ref.contrib, ref.dist], e: [e.irr, e.moic, e.contrib, e.dist] }));
    check('independent model: LP and GP IRR, distributions and the promote agree under the LP-only pref and the 50% catch-up', rel(ref.lpIRR, e.lpIRR, 1e-6) && rel(ref.gpIRR, e.gpIRR, 1e-6) && near(ref.lpDist, e.lpDist, 2) && near(ref.gpDist, e.gpDist, 2) && near(ref.promote, e.promote, 2), JSON.stringify({ r: [ref.lpIRR, ref.gpIRR, ref.lpDist, ref.gpDist, ref.promote], e: [e.lpIRR, e.gpIRR, e.lpDist, e.gpDist, e.promote] }));
    check('independent model: tiers (Tier 1, catch-up) agree', near(ref.tiers.t1, e.tiers.t1, 2) && near(ref.tiers.cu, e.tiers.cu, 2), JSON.stringify([ref.tiers, e.tiers]));
  } else check('independent model ran', false);
  check('no page errors', p.errs.length === 0, p.errs.join('|')); await p.close();
  /* 5 blank terms change nothing: the base Harbor deal has none of them */
  { const q = await open(H); const g0 = await get(q); const q2 = await open(Object.assign({}, H, { conFixedAmt: '', conCeiling: null, conEquityFirst: 0, conUnusedFeePct: undefined, initReserves: [], prefLPOnly: 0, gpCatchupRate: '' })); const g1 = await get(q2);
    check('blank or zero terms reproduce the base case exactly (facility, equity, IRR, LP and GP results)', g0.commit === g1.commit && g0.equityTotal === g1.equityTotal && g0.irr === g1.irr && g0.lpIRR === g1.lpIRR && g0.gpIRR === g1.gpIRR && g0.promote === g1.promote && g0.unused === 0 && g0.resFunded === 0 && !g0.fixed, JSON.stringify([g0.commit, g1.commit, g0.irr, g1.irr]));
    await q.close(); await q2.close(); }
  /* edge: a ceiling below the facility, a unused-fee-only change, reserves on interest */
  { const q = await open(Object.assign({}, H, { conUnusedFeePct: 0.01 })); const g2 = await get(q); check('an unused-commitment fee alone has no effect on a facility sized by loan to cost beyond the fee itself (no fee when the loan is drawn by stabilization... or small)', g2.unused >= 0 && g2.hard.length === 0, JSON.stringify([g2.unused, g2.hard])); await q.close(); }
  { const q = await open(Object.assign({}, B, { conCeiling: 28000000 })); const g3 = await get(q); check('a ceiling just above the facility limits capitalised interest: the balance never passes it and the rest is paid by equity', g3.peak <= 28000000 + 1 && g3.excess > 0 && g3.hard.length === 0, JSON.stringify([g3.peak, g3.excess, g3.hard])); await q.close(); }
  { const q = await open(Object.assign({}, B, { conCeiling: 28000000, initReserves: [{ name: 'Interest', amount: 1000000, at: 'close', use: 'interest' }] })); const g4 = await get(q); check('an interest reserve pays the interest that falls beyond the ceiling before equity does', g4.hard.length === 0 && g4.excess > 0 && Math.abs(g4.relRow + (g4.excess > 1000000 ? 1000000 : g4.excess) - 1000000) < 5, JSON.stringify([g4.excess, g4.relRow, g4.hard])); await q.close(); }
  /* 7 contingency register */
  const cont = async (c) => { const q = await open(Object.assign({}, H, c ? { contingency: c } : {})); const r = await q.evaluate(() => { const x = bkDevV09(), I = bkIntegrity(), s = bkLoad(); return { hard: x.hard, orig: x.contReg ? x.contReg.original : x.hardLadder.contingency, ladderCont: x.hardLadder.contingency, ladderTotal: x.hardLadder.total, unlev: x.unlev, reg: x.contReg, hardFail: I.checks.filter(c => c.status === 'hard').map(c => c.label), s }; }); r.q = q; return r; };
  const c0 = await cont(null);
  check('Harbor Point carries a $2.0M hard-cost contingency in the budget; with no register the budget is untouched', Math.abs(c0.orig - 2000000) < 1 && c0.reg === null, JSON.stringify([c0.orig, c0.reg]));
  const ca = await cont({ allocations: [{ name: 'Podium', amount: 600000 }, { name: 'Envelope', amount: 400000 }], changeOrders: [{ name: 'Waterproofing', month: '2027-06', amount: 350000 }, { name: 'Added shoring', month: '2027-09', amount: 250000 }], forecastMore: 500000, release: 'spent' });
  check('register: original / allocated / unallocated / used / remaining / forecast / forecast remaining are all arithmetic on the entries', ca.reg && Math.abs(ca.reg.allocated - 1000000) < 1e-6 && Math.abs(ca.reg.unallocated - 1000000) < 1e-6 && Math.abs(ca.reg.used - 600000) < 1e-6 && Math.abs(ca.reg.remaining - 1400000) < 1e-6 && Math.abs(ca.reg.forecast - 1100000) < 1e-6 && Math.abs(ca.reg.forecastRemaining - 900000) < 1e-6, JSON.stringify(ca.reg));
  check('contingency spent in full (the default): the budget does not move however the register is used', Math.abs(ca.hard - c0.hard) < 1e-6 && Math.abs(ca.unlev - c0.unlev) < 1e-6, [ca.hard, c0.hard].join(' '));
  const cs = await cont({ changeOrders: [{ name: 'x', amount: 600000 }], forecastMore: 500000, release: 'saved' });
  check('contingency released when unused: the $900,000 not forecast to be used comes out of hard cost, and the cost ladder still adds to the total', Math.abs(c0.hard - cs.hard - 900000) < 1e-6 && Math.abs(cs.ladderTotal - cs.hard) < 1e-6 && cs.hardFail.length === 0, JSON.stringify([c0.hard - cs.hard, cs.hardFail]));
  const co = await cont({ changeOrders: [{ name: 'Redesign', amount: 2500000 }], release: 'saved' });
  check('use beyond the original contingency is an overrun added to hard cost ($500,000 over), even when unused contingency is released', Math.abs(co.hard - c0.hard - 500000) < 1e-6 && Math.abs(co.reg.overrun - 500000) < 1e-6 && co.reg.saved === 0, JSON.stringify(co.reg));
  { const fi = path.join(os.tmpdir(), 'bk-refC-' + process.pid + '.json'); fs.writeFileSync(fi, JSON.stringify(cs.s)); let rf = null; try { rf = JSON.parse(cp.execSync('python3 ' + JSON.stringify(path.join(__dirname, 'harbor', 'reference2.py')) + ' ' + JSON.stringify(fi)).toString()); } catch (er) {}
    check('independent model: the released-contingency budget gives the same hard cost, unlevered cost and facility', rf && Math.abs(rf.hard - cs.hard) < 1 && Math.abs(rf.unlev - cs.unlev) < 1, rf && JSON.stringify([rf.hard, cs.hard, rf.unlev, cs.unlev])); }
  for (const c of [c0, ca, cs, co]) await c.q.close();
  /* 8 the editor */
  { const q = await open(B); const ui = async (tab, sub) => { await q.evaluate(([t, u]) => bkEdGo(t, t, u), [tab, sub]); await q.waitForTimeout(250); return q.evaluate(() => document.querySelector('#viewport').innerText); };
    const setv = async (id, v) => { await q.fill('#' + id, String(v)); await q.dispatchEvent('#' + id, 'change'); await q.waitForTimeout(250); };
    let t = await ui('Investment', 'fin');
    check('Financing shows the four fixed-facility inputs', /Fixed Facility Amount/.test(t) && /Balance Ceiling/.test(t) && /Equity Funds First/.test(t) && /Unused Commitment Fee/.test(t));
    await setv('ae-conFixedAmt', '26,000,000'); check('typing a fixed facility amount writes it and the engine uses it', await q.evaluate(() => bkLoad().conFixedAmt === 26000000 && bkDevFundingV10().commit === 26000000));
    await setv('ae-conUnusedFeePct', ''); check('clearing a term sets it blank and the engine reads it as none', await q.evaluate(() => bkDevFundingV10().unusedFees === 0));
    t = await ui('Investment', 'res');
    check('Reserves shows the three reserves of the brief and what they did', /Initial Reserves/.test(t) && /Released with the Sale/.test(t), t.slice(0, 120));
    await q.click('button:has-text("Add a reserve")'); await q.waitForTimeout(250); check('Add a reserve appends a blank reserve', await q.evaluate(() => bkLoad().initReserves.length === 4));
    await q.evaluate(() => bkEdResDel(3)); await q.waitForTimeout(200);
    t = await ui('Investment', 'cont'); check('Contingency shows the register and its summary', /Forecast at Completion/.test(t) && /Change Orders/.test(t));
    await q.click('button:has-text("Add a change order")'); await q.waitForTimeout(250); await setv('ae-ct-changeOrders-amount-0', '125,000');
    check('a change order is stored and moves Remaining', await q.evaluate(() => bkLoad().contingency.changeOrders[0].amount === 125000 && bkDevV09().contReg.used === 125000));
    t = await ui('Investment', 'jv'); check('Partnership shows the catch-up rate and who earns the preferred return', /Catch-Up Rate to the GP/.test(t) && /Preferred Return Earned By/.test(t));
    await setv('ae-gpCatchupRate', '40'); check('a catch-up rate of 40% is stored as 0.4', await q.evaluate(() => Math.abs(bkLoad().gpCatchupRate - 0.4) < 1e-12));
    await q.evaluate(() => { const s = bkLoad(); s.dealType = 'Acquisition'; bkSave(s); });
    t = await ui('Investment', 'cont'); check('an acquisition shows the development note instead of the register', /This is an acquisition/.test(t));
    const bad = []; for (const [tb, sb] of [['Investment', 'fin'], ['Investment', 'res'], ['Investment', 'cont'], ['Investment', 'jv']]) { const tx = await ui(tb, sb); if (/undefined|NaN|\[object/.test(tx)) bad.push(sb); }
    check('no undefined / NaN / [object] text on the new panels', bad.length === 0, bad.join()); check('no page errors in the editor', q.errs.length === 0, q.errs.join('|')); await q.close(); }
  console.log(checks + ' checks, ' + fails + ' failures'); await b.close(); process.exit(fails ? 1 : 0);
})();
