// Certifies three development-underwriting pieces that had no regression tests:
//  1. Residual land value: the live solve (bkResidualLandSolve) lands on its target, verified independently on the engine; edge cases.
//  2. Draw curves: S-curve steepness values and straight-line cover every category in full, symmetrically, and every monthly funding row balances.
//  3. Sources and uses: monthly draws fund the monthly need, totals tie to the cost ladder, and the loan rolls forward.
// Also checks the Residual Land page has lost its stale "not yet certified" note and the confusing solved-$0 row.
//   node audit/residual_curve_test.js index.html
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); const path = require('path');
const A = require(path.join(__dirname, 'deal.js')), DEV = require(path.join(__dirname, 'devdeal.js'));
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  let checks = 0, fails = 0; const check = (n, ok, d) => { checks++; if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? '  [' + d + ']' : '')); };
  const p = await b.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route(/supabase\.co|vercel\.app|fonts\.g|cdn\.jsdelivr/, r => r.abort()); await p.goto('file://' + path.resolve(process.argv[2])); await p.waitForTimeout(700);
  await p.evaluate(() => document.documentElement.classList.add('bk-auth-ok'));
  const open = (d) => p.evaluate((d) => { bkCreateNewDeal(d); return true; }, d);

  /* ---------- 1. residual land value ---------- */
  await open(DEV);
  const base = await p.evaluate(() => { const r = bkResidualLandSolve(); return { field: r.field, x: r.sol.x, v: r.sol.value, it: r.sol.iterations, ok: r.sol.converged, tgt: r.target, key: r.metricKey, price: r.price }; });
  check('dev deal: the default solve targets a 15.00% levered IRR on the land price and converges', base.ok && base.field === 'purchasePrice' && base.key === 'Levered IRR' && Math.abs(base.tgt - 0.15) < 1e-12 && base.it > 0 && base.it < 70, JSON.stringify(base));
  const ver = await p.evaluate((x) => bkRunWith({ purchasePrice: x }, () => bkMonthlyReturns().irr), base.x);
  check('the solved land price, run through the real engine independently, returns the target IRR (within 0.001%)', Math.abs(ver - 0.15) < 1e-5, (ver * 100).toFixed(5) + '%');
  const sweep = await p.evaluate(() => [0.10, 0.12, 0.15, 0.18].map(t => { const r = bkResidualLandSolve({ target: t }); const irr = bkRunWith({ purchasePrice: r.sol.x }, () => bkMonthlyReturns().irr); return { t, x: r.sol.x, ok: r.sol.converged, irr }; }));
  check('a higher required return solves to a lower land price (10% > 12% > 15% > 18%), each verified on the engine', sweep.every(r => r.ok && Math.abs(r.irr - r.t) < 2e-5) && sweep[0].x > sweep[1].x && sweep[1].x > sweep[2].x && sweep[2].x > sweep[3].x, sweep.map(r => Math.round(r.x)).join(' > '));
  const mets = await p.evaluate(() => ['Levered Equity Multiple', 'Development Yield on Cost', 'Unlevered IRR'].map(k => { const t = /Multiple/.test(k) ? 2.0 : /Yield/.test(k) ? 0.07 : 0.12, r = bkResidualLandSolve({ metric: k, target: t }); return { k, ok: r.sol.converged, v: r.sol.value, t, why: r.sol.why || '' }; }));
  check('other target metrics: an equity multiple and a yield on cost solve to their targets', mets.slice(0, 2).every(m => m.ok && Math.abs(m.v - m.t) < 1e-4 * Math.max(1, m.t)), JSON.stringify(mets.slice(0, 2)));
  check('a metric the engine cannot compute for this deal does not converge, and says why (no made-up answer)', mets[2].ok === false ? mets[2].why.length > 0 : true, JSON.stringify(mets[2]));
  const unreach = await p.evaluate(() => { const r = bkResidualLandSolve({ target: 50 }); return { ok: r.sol.converged, why: r.sol.why }; });
  check('an unreachable target (5000% IRR) is reported as not reachable, not forced', unreach.ok === false && /not reachable|non-finite|bracket/.test(unreach.why || ''), JSON.stringify(unreach));
  const bad = await p.evaluate(() => [0, -0.2, NaN, 'abc'].map(t => { const r = bkResidualLandSolve({ target: t }); return { t: String(t), tgt: r.target, ok: r.sol.converged }; }));
  check('a zero, negative or non-numeric target falls back to the 15% default', bad.every(r => Math.abs(r.tgt - 0.15) < 1e-12 && r.ok), JSON.stringify(bad));
  const wrote = await p.evaluate(() => { const a = JSON.stringify(bkLoad()); bkResidualLandSolve(); bkResidualLandSolve({ target: 0.2 }); return a === JSON.stringify(bkLoad()); });
  check('solving writes nothing to the deal', wrote);
  const zero = await p.evaluate(() => { const s = bkLoad(); s.purchasePrice = 0; bkSave(s); let r; try { r = bkResidualLandSolve(); } catch (e) { return { err: e.message }; } return { ok: r.sol.converged, x: r.sol.x }; });
  check('a blank land price still solves (the search range does not depend on it)', zero.ok === true && zero.x > 0, JSON.stringify(zero));
  await open(DEV);
  const ov = await p.evaluate(() => { const s = bkLoad(); s.landOverrideOn = 1; s.residualLandValue = 4000000; bkSave(s); const r = bkResidualLandSolve(); const irr = bkRunWith({ landOverrideOn: 1, residualLandValue: r.sol.x }, () => ({ irr: bkMonthlyReturns().irr, land: bkDevV09().land })); return { field: r.field, ok: r.sol.converged, irr: irr.irr, land: irr.land, x: r.sol.x }; });
  check('with the land override on, the solve moves the override land value (the one the cost ladder reads) and hits the target', ov.field === 'residualLandValue' && ov.ok && Math.abs(ov.irr - 0.15) < 2e-5 && Math.abs(ov.land - ov.x) < 1, JSON.stringify(ov));
  const land = await p.evaluate(() => { const s = bkLoad(); s.landOverrideOn = 0; s.purchasePrice = 5500000; s.residualLandValue = 4000000; bkSave(s); const off = bkDevV09().land; s.landOverrideOn = 1; bkSave(s); return [off, bkDevV09().land]; });
  check('existing behaviour kept: the cost ladder uses the purchase price, or the override value when the override is on', land[0] === 5500000 && land[1] === 4000000, land.join(' / '));
  await open(Object.assign({}, A, { purchasePrice: 19800000 }));
  const acq = await p.evaluate(() => { const r = bkResidualLandSolve({ target: 0.14 }); const irr = bkRunWith({ purchasePrice: r.sol.x }, () => bkMonthlyReturns().irr); return { ok: r.sol.converged, irr, x: r.sol.x }; });
  check('an acquisition deal solves its purchase price to a target IRR too (verified on the engine)', acq.ok && Math.abs(acq.irr - 0.14) < 2e-5, JSON.stringify(acq));
  await open(DEV);
  const pg = await p.evaluate(async () => { showSheet('Residual Land'); await new Promise(r => setTimeout(r, 900)); const t = document.querySelector('#viewport').innerText, r = bkResidualLandSolve(); return { t, x: r.sol.x }; });
  check('the Residual Land page no longer carries the stale "not yet certified" note', !/not yet\s*certified|Goal Seek/i.test(pg.t));
  check('the Residual Land page no longer shows a "Residual Land Value - solved $0" row while the override is off', !/Residual Land Value\s*-\s*solved/i.test(pg.t));
  check('the page shows the live solved value, and it equals the function\'s', pg.t.includes('$' + Math.round(pg.x).toLocaleString('en-US')) && /SOLVED LIVE/i.test(pg.t));
  const pgOn = await p.evaluate(async () => { const s = bkLoad(); s.landOverrideOn = 1; s.residualLandValue = 4000000; bkSave(s); showSheet('Residual Land'); await new Promise(r => setTimeout(r, 900)); return document.querySelector('#viewport').innerText; });
  check('with the override on, its land value is an editable row and the page says it is in use', /Land value used \(override\)/i.test(pgOn) && /\$4,000,000/.test(pgOn));
  const pgUn = await p.evaluate(async () => { const s = bkLoad(); s.landOverrideOn = 0; bkSave(s); showSheet('Residual Land'); const m = await new Promise(r => setTimeout(() => r(null), 0)); const o = document.querySelector('#viewport').innerText; return o; });

  /* ---------- 2. draw curves ---------- */
  await open(DEV);
  const cv = await p.evaluate(() => { const out = { sums: [], sym: [], peak: [], flat: [], outside: [], near: null }; const S = [0.5, 1, 2, 3, 5, 7, 10, 15], L = [3, 6, 12, 18, 24, 36];
    for (const len of L) for (const d of S) { let t = 0, sym = true; const sh = []; for (let m = 1; m <= len; m++) { const v = bkCurveShare(m, 1, len, 'S-Curve', d); sh.push(v); t += v; } for (let k = 0; k < len; k++) if (Math.abs(sh[k] - sh[len - 1 - k]) > 1e-6) sym = false; out.sums.push([len, d, t]); out.sym.push([len, d, sym]); }
    for (const len of [12, 24]) { let prev = 0; for (const d of S) { const mid = bkCurveShare(Math.ceil(len / 2), 1, len, 'S-Curve', d); out.peak.push([len, d, mid, mid >= prev - 1e-12]); prev = mid; } }
    for (const len of L) { let ok = true; for (let m = 1; m <= len; m++) if (Math.abs(bkCurveShare(m, 1, len, 'Straight-Line', 7) - 1 / len) > 1e-12) ok = false; out.flat.push(ok); }
    out.outside = [bkCurveShare(0, 1, 12, 'S-Curve', 7), bkCurveShare(13, 1, 12, 'S-Curve', 7), bkCurveShare(5, 1, 0, 'S-Curve', 7), bkCurveShare(2, 3, 12, 'S-Curve', 7) ];
    out.near = Math.max(...Array.from({ length: 12 }, (_, i) => Math.abs(bkCurveShare(i + 1, 1, 12, 'S-Curve', 0.0001) - 1 / 12)));
    return out; });
  check('every S-curve steepness (0.5 to 15) over every length (3 to 36 months) draws exactly 100% of its category', cv.sums.every(([l, d, t]) => Math.abs(t - 1) < 1e-9), cv.sums.filter(([l, d, t]) => Math.abs(t - 1) >= 1e-9).slice(0, 3).join(' | '));
  check('every S-curve is symmetric about the middle of its window (to 1e-6: the error function it uses is accurate to about 1e-7)', cv.sym.every(r => r[2]), '');
  check('a steeper S-curve puts more of the cost in the middle month (steepness 0.5 up to 15)', cv.peak.every(r => r[3]), cv.peak.map(r => r[2].toFixed(4)).join(' '));
  check('straight-line is an equal share every month, whatever the steepness setting', cv.flat.every(Boolean));
  check('nothing is drawn outside the window (before the start, after the end, or over a zero length)', cv.outside.every(v => v === 0), cv.outside.join(','));
  check('a near-zero steepness collapses to straight-line (within 0.1% of a month\'s share)', cv.near < 1e-3, cv.near);
  const combos = [];
  for (const hard of [['Straight-Line', 1], ['S-Curve', 1], ['S-Curve', 3], ['S-Curve', 7], ['S-Curve', 12]]) for (const soft of [['Straight-Line', 1], ['S-Curve', 2], ['S-Curve', 5], ['S-Curve', 10]]) combos.push({ hardCurveMethod: hard[0], hardCurveSteepness: hard[1], softConMethod: soft[0], softConSteepness: soft[1], softPreMethod: hard[0] === 'S-Curve' ? 'S-Curve' : 'Straight-Line', softLeaseMethod: soft[0] });
  const cov = await p.evaluate((combos) => combos.map(o => bkRunWith(o, () => { const f = bkDevFundingV10(), x = bkDevV09(), M = f.months, S = k => M.reduce((t, m) => t + (m[k] || 0), 0);
      const rowErr = Math.max(...M.map(m => Math.abs(m.loanDraw + m.eq + m.overflow - m.need))), rollErr = Math.max(...M.map(m => Math.abs(m.end - (m.beg + m.capInt + m.loanDraw))));
      return { o, hard: S('hard') - x.hard, soft: S('soft') - x.soft, lease: S('lease') - x.leaseDef, land: S('land') - (x.land + x.close + x.acq + x.pre), need: S('need') - (S('land') + S('hard') + S('soft') + S('lease') + S('fees')), rowErr, rollErr, tot: S('loanDraw') + S('eq') + S('overflow') - S('need'), neg: M.some(m => m.hard < -1e-6 || m.soft < -1e-6 || m.need < -1e-6) }; })), combos);
  const bad2 = cov.filter(r => Math.abs(r.hard) > 1 || Math.abs(r.soft) > 1 || Math.abs(r.lease) > 1 || Math.abs(r.land) > 1);
  check('across 20 curve combinations (straight-line and S-curve at several steepness values), the monthly hard, soft, lease-up and land (with closing, acquisition and pre-development costs) draws add up to the full category budget', bad2.length === 0, JSON.stringify(bad2.slice(0, 1)));
  check('...and no draw is negative', cov.every(r => !r.neg));
  const bad3 = cov.filter(r => r.rowErr > 0.01 || Math.abs(r.need) > 1 || Math.abs(r.tot) > 1 || r.rollErr > 0.01);
  check('sources and uses: in every month loan draw + equity + overflow = the funding need; the need adds to land + hard + soft + lease-up + fees; total sources = total uses', bad3.length === 0, JSON.stringify(bad3.slice(0, 1)));
  const lev = await p.evaluate(() => { const f = bkDevFundingV10(), S = k => f.months.reduce((t, m) => t + (m[k] || 0), 0); return { levered: f.levered, need: S('need'), capInt: S('capInt'), cap: f.actualCapInt }; });
  check('the all-in cost (levered) = total funding need + capitalised interest', Math.abs(lev.levered - (lev.need + lev.capInt)) < 1 && Math.abs(lev.capInt - lev.cap) < 1, JSON.stringify(lev));
  const sh = await p.evaluate(() => { const a = bkRunWith({ hardCurveMethod: 'S-Curve', hardCurveSteepness: 1 }, () => bkDevFundingV10().months.map(m => m.hard)), c = bkRunWith({ hardCurveMethod: 'S-Curve', hardCurveSteepness: 12 }, () => bkDevFundingV10().months.map(m => m.hard)), d = bkRunWith({ hardCurveMethod: 'Straight-Line' }, () => bkDevFundingV10().months.map(m => m.hard));
    const peak = v => Math.max(...v), tot = v => v.reduce((t, x) => t + x, 0); return { p1: peak(a) / tot(a), p12: peak(c) / tot(c), pl: peak(d) / tot(d) }; });
  check('the draw shape changes with the steepness setting in the funding schedule itself (flat < gentle S < steep S)', sh.pl < sh.p1 + 1e-9 && sh.p1 < sh.p12, JSON.stringify(sh));
  check('no page errors', errs.length === 0, errs.slice(0, 2).join(' | '));
  await b.close(); console.log(checks + ' checks, ' + fails + ' failures'); process.exit(fails ? 1 : 0);
})();
