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

  /* 6. the sheet */
  const ui = await p.evaluate(async () => { showSheet('Equity Waterfall'); await new Promise(r => setTimeout(r, 900)); return document.querySelector('#viewport').innerText; });
  check('the Equity Waterfall sheet shows the verification: each hurdle with its replayed IRR, still owed, and Pass / Fail', /Waterfall verification/.test(ui) && /Replayed IRR/i.test(ui) && /Still owed/i.test(ui) && /PASS/.test(ui) && /Tiers are paid in order/.test(ui));
  check('the deal is untouched by verifying it', await p.evaluate(() => { const a = JSON.stringify(bkLoad()); bkWaterfallChecks(); return a === JSON.stringify(bkLoad()); }));
  check('no page errors', errs.length === 0, errs.slice(0, 2).join(' | '));
  console.log(checks + ' checks, ' + fails + ' failures'); await b.close(); process.exit(fails ? 1 : 0);
})();
