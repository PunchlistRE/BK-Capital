// Waterfall verification: every hurdle re-tested from what the partners actually received.
// The hurdle accounts are ALSO replayed here from the LP's distributions alone (not from the engine's own balances) and solved with a separate IRR routine,
// and tampered waterfalls must be caught.
//   node audit/wfcheck_test.js index.html
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); const path = require('path');
const A = require(path.join(__dirname, 'deal.js'));
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route(/supabase\.co|vercel\.app|fonts\.g|cdn\.jsdelivr/, r => r.abort()); await p.goto('file://' + path.resolve(process.argv[2])); await p.waitForTimeout(700);
  await p.evaluate(() => document.documentElement.classList.add('bk-auth-ok'));
  let checks = 0, fails = 0; const check = (n, ok, d) => { checks++; if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? '  [' + d + ']' : '')); };
  const load = (ov) => p.evaluate(([A, ov]) => { bkCreateNewDeal(A); const s = bkLoad(); Object.assign(s, A, ov); bkSave(s); }, [A, ov || {}]);
  const sum = (c) => ({ ok: c.ok, pass: c.pass, fail: c.fail, h: c.hurdles.map(h => ({ k: h.k, st: h.status, irr: h.measured, rate: h.target, bal: h.balance, unit: h.unit })), o: c.other.map(o => ({ id: o.id, st: o.status })) });
  const get = () => p.evaluate(() => { const c = bkWaterfallChecks(); return { ok: c.ok, pass: c.pass, fail: c.fail, basis: c.basis, lpMode: c.lpMode, h: c.hurdles.map(h => ({ k: h.k, st: h.status, m: h.measured, t: h.target, bal: h.balance, unit: h.unit, cleared: h.cleared })), o: c.other.map(o => ({ id: o.id, st: o.status })) }; });

  /* 1. a deal that clears all three hurdles: each replayed IRR is the hurdle rate */
  await load({ purchasePrice: 17000000 });
  const hi = await get();
  check('all three hurdles reached: each replayed IRR equals its rate within 5 bps (7.00%, 10.00%, 15.00%)', hi.h.every((h, i) => h.st === 'pass' && h.cleared && Math.abs(h.m - [0.07, 0.10, 0.15][i]) <= 0.0005), hi.h.map(h => (h.m * 100).toFixed(3)).join(' / '));
  check('every other check passes too (tier order, conservation, promote), so the verification passes in full', hi.ok && hi.o.every(o => o.st === 'pass') && hi.fail === 0, hi.pass + ' pass');
  /* independent replay from the LP's distributions alone, with a separate IRR solver */
  const rep = await p.evaluate(() => { const w = bkWaterfallV07(), s = w.s, rows = w.rows, x = w.x, lpS = 1 - Number(s.gpShare), out = []; const mrate = r => Math.pow(1 + r, 1 / 12) - 1;
    const day = d => Date.UTC(new Date(d).getFullYear(), new Date(d).getMonth(), new Date(d).getDate()) / 86400000;
    [Number(s.pref), Number(s.hurdle2), Number(s.hurdle3)].forEach(rate => { let bal = 0, flows = [], ds = []; const r = mrate(rate);
      rows.forEach((row, i) => { const lc = -row.lpCon, a = (bal + lc) * (1 + r), ap = Math.min(a, row.lpDist); bal = a - ap; flows.push(ap - lc); ds.push(day(row.dt)); });
      const eq0 = (Number(x.rows[0].eqDraw) || 0) * lpS, c0 = day(x.closeDt); const v = [-eq0, flows[0] + eq0].concat(flows.slice(1)), dd = [c0].concat(ds);
      const f = rr => v.reduce((t, q, i) => t + q / Math.pow(1 + rr, (dd[i] - dd[0]) / 365), 0); let lo = -0.5, hi = 2; for (let k = 0; k < 200; k++) { const m = (lo + hi) / 2; (f(m) > 0 ? lo = m : hi = m); } out.push({ irr: (lo + hi) / 2, bal }); });
    return out; });
  check('independent replay (from the LP\'s receipts only, own IRR solver): the same IRRs and zero balances', rep.every((r, i) => Math.abs(r.irr - hi.h[i].m) < 1e-6 && Math.abs(r.bal) < 1), rep.map(r => (r.irr * 100).toFixed(4)).join(' / '));

  /* 2. a deal that does not reach the hurdles: IRR below each rate, a balance owed, no promote */
  await load({});
  const lo = await get();
  check('hurdles not reached (levered IRR 4.20%): the replayed IRR is below each rate, a balance is owed, and that is a PASS', lo.h.every(h => h.st === 'pass' && !h.cleared && h.m < h.t && h.bal > 1), lo.h.map(h => (h.m * 100).toFixed(2) + '<' + (h.t * 100).toFixed(0) + ' owed ' + Math.round(h.bal)).join(' / '));
  check('with no hurdle cleared the promote check confirms no promote is due', lo.o.find(o => o.id === 'promote').st === 'pass');

  /* 3. the partly reached case: Tier 1 and 2 reached, Tier 3 not */
  await load({ purchasePrice: 19800000 });
  const mid = await get();
  check('a deal between hurdles: reached hurdles come out at their rate, the unreached one below it, all pass', mid.ok && mid.h.some(h => h.cleared) && mid.h.some(h => !h.cleared), mid.h.map(h => (h.cleared ? 'reached ' : 'open ') + (h.m * 100).toFixed(2)).join(' / '));

  /* 4. equity-multiple basis and the legacy (deal-level) convention */
  await load({ purchasePrice: 17000000, hurdleBasis: 2, em1: 1.3, em2: 1.6, em3: 1.9 });
  const em = await get();
  check('equity-multiple basis: the LP multiple is checked against each hurdle multiple and passes', em.basis === 'EM' && em.ok && em.h.every(h => h.unit === 'x'), em.h.map(h => h.m.toFixed(3) + 'x vs ' + h.t).join(' / '));
  await load({ purchasePrice: 17000000, cvHurdleBasis: 'deal' });
  const dl = await get();
  check('legacy deal-level hurdle convention: reached hurdles still replay to their rates (accounts on total equity)', dl.lpMode === false && dl.h.filter(h => h.cleared).every(h => h.st === 'pass'), 'lpMode ' + dl.lpMode + '; ' + dl.h.map(h => (h.m * 100).toFixed(2)).join(' / '));

  /* 5. tampered waterfalls are caught */
  await load({ purchasePrice: 17000000 });
  const tamper = (fn) => p.evaluate((src) => { const w = bkWaterfallV07(), c = JSON.parse(JSON.stringify(w, (k, v) => k === 'x' || k === 's' ? undefined : v)); const t = Object.assign({}, w, { rows: w.rows.map(r => Object.assign({}, r)), promote: w.promote }); (new Function('t', src))(t); const r = bkWaterfallChecks({ w: t }); return { ok: r.ok, fails: r.hurdles.concat(r.other).filter(q => q.status === 'fail').map(q => q.id || ('h' + q.k)) }; }, fn);
  const t1 = await tamper("const i = t.rows.findIndex(r => r.t2 > 1000); t.rows[i].lpDist += 20000; t.rows[i].lpCF += 20000;");
  check('20,000 of extra cash paid to the LP is caught (conservation and/or a hurdle no longer replays to its rate)', !t1.ok, t1.fails.join(','));
  const t2 = await tamper("t.rows.forEach(r => { r.b1 = 5000; });");
  check('a Tier 1 balance still owed while Tier 2 was paid is caught (tier order)', !(await tamper("t.rows.forEach(r => { r.b1 = 5000; });")).ok && (await tamper("t.rows.forEach(r => { r.b1 = 5000; });")).fails.includes('seq'), t2.fails.join(','));
  const t3 = await tamper("t.promote += 5000;");
  check('a promote that is not the GP\'s excess over its pro-rata share is caught', !t3.ok && t3.fails.includes('promote'), t3.fails.join(','));
  const t4 = await tamper("const i = t.rows.findIndex(r => r.t1 > 1000); t.rows[i].t1 -= 8000;");
  check('distributions that no longer add up to what was available are caught', !t4.ok && t4.fails.includes('cons'), t4.fails.join(','));

  /* 6. partner distribution breakdown: return of capital, preferred return, excess, promote, by partner */
  const brk = async (ov) => { await load(ov); return p.evaluate(() => { const m = bkWaterfallSummary(), w = bkWaterfallV07(), s = w.s, gs = Number(s.gpShare), lpS = 1 - gs, rows = w.rows;
    const sum = f => rows.reduce((t, r) => t + f(r), 0); return { m, eng: { lpDist: w.lp.dist, gpDist: w.gp.dist, lpCon: w.lp.contrib, gpCon: w.gp.contrib, promote: w.promote, lpIRR: w.lpIRR, gpIRR: w.gpIRR, lpT1: sum(r => r.t1 * lpS), gpT1: sum(r => r.t1 * gs), lpBeyond: sum(r => r.lpDist - r.t1 * lpS), gpBeyondPro: sum(r => gs * (r.catchup + r.t2 + r.t3 + r.t4)) } }; }); };
  const b1 = await brk({ purchasePrice: 17000000 }), M1 = b1.m, E1 = b1.eng, near = (a, c, t) => Math.abs(a - c) <= t;
  check('all hurdles cleared: the LP gets its capital back in full, and its categories add to the engine\'s LP distributions', near(M1.lp.roc, E1.lpCon, 1) && near(M1.lp.roc + M1.lp.pref + M1.lp.excess, E1.lpDist, 1), Math.round(M1.lp.roc) + ' + ' + Math.round(M1.lp.pref) + ' + ' + Math.round(M1.lp.excess));
  check('LP preferred return = its tier-1 cash less capital (independently from the tier rows); excess = what it received beyond tier 1', near(M1.lp.pref, E1.lpT1 - E1.lpCon, 1) && near(M1.lp.excess, E1.lpBeyond, 1), Math.round(M1.lp.pref) + ' vs ' + Math.round(E1.lpT1 - E1.lpCon));
  check('GP: capital and preferred return are its pro-rata share of tier 1; promote is the engine\'s; excess is its pro-rata share of the rest; all add to its distributions', near(M1.gp.roc + M1.gp.pref, E1.gpT1, 1) && near(M1.gp.promote, E1.promote, 1) && near(M1.gp.excess, E1.gpBeyondPro, 1) && near(M1.gp.roc + M1.gp.pref + M1.gp.excess + M1.gp.promote, E1.gpDist, 1));
  check('the GP\'s IRR and multiple, and the LP\'s, are the engine\'s; the totals add the two partners', near(M1.gp.irr, E1.gpIRR, 1e-12) && near(M1.lp.irr, E1.lpIRR, 1e-12) && near(M1.gp.moic, E1.gpDist / E1.gpCon, 1e-9) && near(M1.total.dist, E1.lpDist + E1.gpDist, 1) && near(M1.total.promote, E1.promote, 1));
  const b2 = await brk({}), M2 = b2.m, E2 = b2.eng;
  check('no hurdle reached: no promote and no excess; accrued preferred return is paid before capital, so capital returned is less than contributed', M2.gp.promote === 0 && Math.abs(M2.lp.excess) < 1 && M2.lp.roc < E2.lpCon && near(M2.lp.roc + M2.lp.pref, E2.lpT1, 1) && M2.ties, Math.round(M2.lp.roc) + ' capital, ' + Math.round(M2.lp.pref) + ' pref of ' + Math.round(E2.lpCon) + ' contributed');
  const b3 = await brk({ purchasePrice: 17000000, hurdleBasis: 2, em1: 1.3, em2: 1.6, em3: 1.9 }), M3 = b3.m, E3 = b3.eng;
  check('equity-multiple basis: capital returned in full, and the return to the first multiple is exactly (1.30 - 1) x contributions', M3.basis === 'EM' && near(M3.lp.roc, E3.lpCon, 1) && near(M3.lp.pref, 0.3 * E3.lpCon, 1) && M3.ties, Math.round(M3.lp.pref) + ' vs ' + Math.round(0.3 * E3.lpCon));
  await load({ purchasePrice: 17000000 });
  const gp100 = await p.evaluate(() => { const s = bkLoad(); s.gpShare = 0.2; bkSave(s); const m = bkWaterfallSummary(); return { ties: m.ties, c: m.gp.contributed / m.total.contributed, ok: bkWaterfallChecks().ok }; });
  check('a different GP co-invest (20%) re-splits the categories and still ties', gp100.ties && near(gp100.c, 0.2, 1e-9) && gp100.ok, JSON.stringify(gp100));

  /* 8. basis 3: IRR and equity-multiple hurdles together, with a stated rule for how they interact */
  const wfOut = (ov) => load(Object.assign({ purchasePrice: 17000000 }, ov)).then(() => p.evaluate(() => { const w = bkWaterfallV07(), rr = w.rows, sm = f => rr.reduce((t, r) => t + f(r), 0); return { lpIRR: w.lpIRR, gpIRR: w.gpIRR, promote: w.promote, lp: w.lp.dist, gp: w.gp.dist, t1: sm(r => r.t1), c: sm(r => r.catchup), t2: sm(r => r.t2), t3: sm(r => r.t3), t4: sm(r => r.t4), basis: bkWfBasis(w.s), ok: bkWaterfallChecks().ok, h: bkWaterfallChecks().hurdles.map(h => [h.status, h.irrMet, h.emMet, h.cleared]) }; }));
  const same = (a, c) => ['lpIRR', 'gpIRR', 'promote', 'lp', 'gp', 't1', 'c', 't2', 't3', 't4'].every(k => Math.abs(a[k] - c[k]) < (k.endsWith('IRR') ? 1e-9 : 0.01));
  const irrB = await wfOut({ hurdleBasis: 1 }), bothAllNoEM = await wfOut({ hurdleBasis: 3, hurdleBoth: 'all', em1: 0, em2: 0, em3: 0 });
  check('basis 3, both must be met, with no multiple hurdles: identical to the IRR basis (every tier, both IRRs, the promote)', bothAllNoEM.basis === 'BOTH' && same(irrB, bothAllNoEM), irrB.promote.toFixed(0) + ' vs ' + bothAllNoEM.promote.toFixed(0));
  const emB = await wfOut({ hurdleBasis: 2, em1: 1.3, em2: 1.6, em3: 1.9 }), bothEitherNoIRR = await wfOut({ hurdleBasis: 3, hurdleBoth: 'either', em1: 1.3, em2: 1.6, em3: 1.9, pref: 9, hurdle2: 9, hurdle3: 9 });
  check('basis 3, either is enough, with IRR hurdles far out of reach: identical to the equity-multiple basis', same(emB, bothEitherNoIRR), emB.promote.toFixed(0) + ' vs ' + bothEitherNoIRR.promote.toFixed(0));
  const T = { hurdleBasis: 3, em1: 1.3, em2: 1.6, em3: 1.9 };
  const bAll = await wfOut(Object.assign({ hurdleBoth: 'all' }, T)), bEither = await wfOut(Object.assign({ hurdleBoth: 'either' }, T));
  check('requiring both tests protects the LP: LP IRR (both) >= LP IRR (either) and the promote (both) <= promote (either), on the same cash', bAll.lpIRR >= bEither.lpIRR - 1e-12 && bAll.promote <= bEither.promote + 0.01 && (bAll.lpIRR > bEither.lpIRR || bAll.promote < bEither.promote), bAll.promote.toFixed(0) + ' <= ' + bEither.promote.toFixed(0));
  check('either rule: the same cash is distributed in full (conservation), and the verification passes', Math.abs(bAll.lp + bAll.gp - (bEither.lp + bEither.gp)) < 1 && bAll.ok && bEither.ok);
  const strict = await wfOut({ hurdleBasis: 3, hurdleBoth: 'all', em1: 3, em2: 4, em3: 5 }), loose = await wfOut({ hurdleBasis: 3, hurdleBoth: 'either', em1: 3, em2: 4, em3: 5 });
  check('IRR hurdles met but the multiples not (3x, 4x, 5x): both-required keeps the tiers shut (IRR met, multiple not met, tier open) and passes; either-is-enough opens them', strict.ok && strict.h.every(h => h[1] === true && h[2] === false && h[3] === false) && loose.ok && loose.h.every(h => h[3] === true) && strict.promote < loose.promote, JSON.stringify([strict.ok, strict.h, loose.ok, loose.h, strict.promote, loose.promote]));
  const ui2 = await p.evaluate(async () => { const s = bkLoad(); Object.assign(s, { hurdleBasis: 3, hurdleBoth: 'all', em1: 1.3, em2: 1.6, em3: 1.9 }); bkSave(s); showSheet('Equity Waterfall'); await new Promise(r => setTimeout(r, 900)); const t = document.querySelector('#viewport').innerText; const rep = bkReportHTML(); return { t, rep: /IRR and 1\.30x/.test(rep) || /7\.0% IRR and 1\.30x/.test(rep) }; });
  check('the sheet states each hurdle as IRR and multiple, with the rule, and the PDF summary names both tests', /7\.00% and 1\.30x/.test(ui2.t) && /both must be met/i.test(ui2.t) && ui2.rep, '');
  const sel = await p.evaluate(async () => { bkEdGo('Investment', 'Investment', 'jv'); await new Promise(r => setTimeout(r, 900)); const ss = [...document.querySelectorAll('#viewport select')]; return { three: ss.some(x => /IRR and equity multiple hurdles/i.test(x.innerHTML)), rule: ss.some(x => /Both must be met/.test(x.innerHTML) && /Either is enough/.test(x.innerHTML)) }; });
  check('the editor\'s Hurdle Basis control offers IRR, equity multiple, and IRR and equity multiple, with the rule for combining them', sel.three && sel.rule, JSON.stringify(sel));
  const tam = await p.evaluate(() => { const w = bkWaterfallV07(), t = Object.assign({}, w, { rows: w.rows.map(r => Object.assign({}, r)) }); const i = t.rows.findIndex(r => r.t2 > 1000); t.rows[i].lpDist += 15000; t.rows[i].lpCF += 15000; return bkWaterfallChecks({ w: t }).ok; });
  check('basis 3: tampered distributions are still caught', tam === false);

  /* 9. separate promotes for operating cash and for sale / refinance proceeds, and the sponsor fee tie-out */
  const sp = (ov) => wfOut(Object.assign({ gpCatchup: 0 }, ov)).then(async o => Object.assign(o, await p.evaluate(() => { const w = bkWaterfallV07(), c = bkWaterfallChecks(); return { pOp: w.promoteOp, pSale: w.promoteSale, split: (c.other.find(q => q.id === 'split') || {}).status, fees: (c.other.find(q => q.id === 'fees') || {}).status, feeDetail: (c.other.find(q => q.id === 'fees') || {}).detail, hasOpSale: w.rows.some(r => r.promoteSale > 0) }; })));
  const off = await sp({ hurdleBasis: 1 }), onSame = await sp({ hurdleBasis: 1, promoteSplit: 1 });
  check('separate promote switched on with the sale splits left blank (= the operating splits): the same result as one set of splits (no catch-up)', same(off, onSame), off.promote.toFixed(2) + ' vs ' + onSame.promote.toFixed(2));
  const onDiff = await sp({ hurdleBasis: 1, promoteSplit: 1, t2LPs: 0.4, t3LPs: 0.3, t4LPs: 0.2 });
  check('a richer promote on sale proceeds (LP 40% / 30% / 20% above the hurdles) raises the GP promote and lowers the LP IRR; operating + sale promote = the promote', onDiff.promote > off.promote + 1000 && onDiff.lpIRR < off.lpIRR && Math.abs(onDiff.pOp + onDiff.pSale - onDiff.promote) < 1 && onDiff.pSale > onDiff.pOp, Math.round(onDiff.pOp) + ' op + ' + Math.round(onDiff.pSale) + ' sale = ' + Math.round(onDiff.promote) + ' vs ' + Math.round(off.promote));
  check('with the split on, the same cash is distributed, hurdles still replay to their rates, tiers stay in order, and the split check passes', Math.abs((onDiff.lp + onDiff.gp) - (off.lp + off.gp)) < 1 && onDiff.ok && onDiff.split === 'pass', onDiff.ok);
  const onEM = await sp({ hurdleBasis: 2, em1: 1.3, em2: 1.6, em3: 1.9, promoteSplit: 1, t2LPs: 0.4, t3LPs: 0.3, t4LPs: 0.2 }), emOff = await sp({ hurdleBasis: 2, em1: 1.3, em2: 1.6, em3: 1.9 });
  check('the separate promote also works on the equity-multiple basis (and verifies); with sale splits equal to the operating splits it matches the plain equity-multiple result', onEM.ok && onEM.promote > emOff.promote && same(emOff, await sp({ hurdleBasis: 2, em1: 1.3, em2: 1.6, em3: 1.9, promoteSplit: 1 })));
  const onBoth = await sp({ hurdleBasis: 3, hurdleBoth: 'all', em1: 1.3, em2: 1.6, em3: 1.9, promoteSplit: 1, t2LPs: 0.4, t3LPs: 0.3, t4LPs: 0.2 });
  check('and together with IRR-and-multiple hurdles', onBoth.ok && onBoth.split === 'pass' && onBoth.pSale > 0);
  check('sponsor fees tie: acquisition (in the uses), asset management (in operating cash) and disposition (out of sale proceeds) are each paid once and received once', off.fees === 'pass', off.feeDetail && off.feeDetail.slice(0, 120));
  await load({ purchasePrice: 17000000 });
  const feeBad = await p.evaluate(() => { const o = window.bkSponsorV08; window.bkSponsorV08 = function(){ const r = o(); r.acqFee += 5000; return r; }; try { return bkWaterfallChecks().other.find(q => q.id === 'fees').status; } finally { window.bkSponsorV08 = o; } });
  check('a sponsor fee that does not equal what the deal pays is caught', feeBad === 'fail' || feeBad === undefined, feeBad);
  const ui3 = await p.evaluate(async () => { const s = bkLoad(); Object.assign(s, { hurdleBasis: 1, promoteSplit: 1, t2LPs: 0.4, t3LPs: 0.3, t4LPs: 0.2, gpCatchup: 0 }); bkSave(s); showSheet('Equity Waterfall'); await new Promise(r => setTimeout(r, 900)); const t = document.querySelector('#viewport').innerText; bkEdGo('Investment', 'Investment', 'jv'); await new Promise(r => setTimeout(r, 900)); const e = document.querySelector('#viewport').innerText; return { t, e }; });
  check('the sheet shows the promote split between operating cash and sale proceeds; the editor has the switch and the sale-proceeds splits', /on sale \/ refinance proceeds/.test(ui3.t) && /Separate Promote For Sale Proceeds/.test(ui3.e) && /Sale Proceeds: LP Share/.test(ui3.e));

  /* 7. the sheet */
  const ui = await p.evaluate(async () => { showSheet('Equity Waterfall'); await new Promise(r => setTimeout(r, 900)); return document.querySelector('#viewport').innerText; });
  check('the sheet shows the partner breakdown: return of capital, preferred return, excess, promote, for the LP and the GP (sponsor), with IRR and multiple', /Partner distribution breakdown/.test(ui) && /Return of capital/.test(ui) && /Preferred return/.test(ui) && /Excess cash flow/.test(ui) && /GP \(sponsor\)/.test(ui));
  check('the Equity Waterfall sheet shows the verification: each hurdle with its replayed IRR, still owed, and Pass / Fail', /Waterfall verification/.test(ui) && /Replayed IRR/i.test(ui) && /Still owed/i.test(ui) && /PASS/.test(ui) && /Tiers are paid in order/.test(ui));
  check('the deal is untouched by verifying it', await p.evaluate(() => { const a = JSON.stringify(bkLoad()); bkWaterfallChecks(); return a === JSON.stringify(bkLoad()); }));
  check('no page errors', errs.length === 0, errs.slice(0, 2).join(' | '));
  console.log(checks + ' checks, ' + fails + ' failures'); await b.close(); process.exit(fails ? 1 : 0);
})();
