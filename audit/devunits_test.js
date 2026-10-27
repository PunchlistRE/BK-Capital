// Development lease-up by unit type. Existing deals and the simple ramp are untouched; the unit schedule feeds the same ramp the engine already
// consumes, so occupancy drives rental income, operating costs, the lease-up shortfall that is funded, the stabilisation month and the development cash flow.
//   node audit/devunits_test.js index.html [reference.html]
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); const path = require('path');
const DEV = require(path.join(__dirname, 'devdeal.js')), A = require(path.join(__dirname, 'deal.js'));
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  let checks = 0, fails = 0; const check = (n, ok, d) => { checks++; if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? '  [' + String(d).slice(0, 320) + ']' : '')); };
  const mk = async (file) => { const p = await b.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message)); await p.route(/supabase\.co|vercel\.app|fonts\.g|cdn\.jsdelivr/, r => r.abort()); await p.goto('file://' + path.resolve(file)); await p.waitForTimeout(700); await p.evaluate(() => document.documentElement.classList.add('bk-auth-ok')); return p; };
  const p = await mk(process.argv[2]);
  const open = (d) => p.evaluate((d) => { bkCreateNewDeal(d); return true; }, d);
  const SNAP = () => { const x = bkDevV09(), m = bkMonthlyReturns(), f = bkDevFundingV10(); return { lu: x.luMo, stab: x.stab, def: x.leaseDef, ramp: x.leaseupRamp.map(r => [r.mo, r.egi, r.after]), irr: m.irr, moic: m.moic, lev: f.levered, need: f.months.map(z => z.need), rows: m.rows.map(r => [r.noi, r.egi, r.cf]) }; };
  window_SNAP = SNAP.toString();
  const snapOf = (d) => p.evaluate(([d, src]) => { bkCreateNewDeal(d); return eval('(' + src + ')')(); }, [d, window_SNAP]);
  const same = (a, b2, tol) => JSON.stringify(a, (k, v) => typeof v === 'number' ? Math.round(v / (tol || 1e-7)) : v) === JSON.stringify(b2, (k, v) => typeof v === 'number' ? Math.round(v / (tol || 1e-7)) : v);

  /* ---- 1. existing deals untouched ---- */
  const off = await p.evaluate(([d, src]) => { bkCreateNewDeal(d); return { on: bkDevUnitOn(), ...eval('(' + src + ')')() }; }, [DEV, window_SNAP]);
  check('a deal that has not chosen unit-level lease-up reports it as off', off.on === false);
  if (process.argv[3]) {
    const q = await mk(process.argv[3]); const ref = await q.evaluate(([d, src]) => { bkCreateNewDeal(d); return eval('(' + src + ')')(); }, [DEV, window_SNAP]);
    const cur = Object.assign({}, off); delete cur.on;
    check('existing development deal: lease-up ramp, shortfall, funding, cash flow, IRR and multiple are identical to the reference build', same(cur, ref), 'IRR ' + off.irr + ' vs ' + ref.irr);
    const accq = await q.evaluate((d) => { bkCreateNewDeal(d); return bkMonthlyReturns().irr; }, A), accp = await p.evaluate((d) => { bkCreateNewDeal(d); return bkMonthlyReturns().irr; }, A);
    check('an acquisition deal is untouched', accq === accp);
    await q.close();
  }

  /* ---- 2. the seeded single type reproduces the simple ramp exactly ---- */
  for (const [nm, ov] of [['no pre-leasing, 14 months', {}], ['30% pre-leased, 12 months', { leaseupMonths: 12, preleasedPct: 0.3 }], ['fully pre-leased at completion', { leaseupMonths: 0, preleasedPct: 1 }], ['pre-leased 10%, 20 months', { leaseupMonths: 20, preleasedPct: 0.1 }]]) {
    const d = Object.assign({}, DEV, ov), a = await snapOf(d);
    const c = await p.evaluate(([src]) => { bkDevUnitMode('units'); return eval('(' + src + ')')(); }, [window_SNAP]);
    check('switching to unit type with the deal as entered changes nothing: ' + nm + ' (ramp, shortfall, funding, cash flow, IRR)', same(a, c, 1e-6), 'IRR ' + a.irr + ' vs ' + c.irr + '; lu ' + a.lu + '/' + c.lu);
  }

  /* ---- 3. a real unit mix ---- */
  await open(DEV);
  const MIX = [{ name: '1 BR', units: 60, rent: 1800, deliverStart: 0, deliverPerMo: 20, marketStart: -2, absorbPerMo: 6, preleased: 6, commenceLag: 1, freeMonths: 1 }, { name: '2 BR', units: 60, rent: 2300, deliverStart: 1, deliverPerMo: 15, marketStart: 0, absorbPerMo: 5, preleased: 0, commenceLag: 1, freeMonths: 1 }, { name: '3 BR', units: 30, rent: 2900, deliverStart: 3, deliverPerMo: 10, marketStart: 2, absorbPerMo: 2, preleased: 0, commenceLag: 2, freeMonths: 2 }];
  const set = (types, extra) => p.evaluate(([types, extra]) => { const s = bkLoad(); s.devLeaseup = Object.assign({ mode: 'units', types: types }, extra || {}); bkSave(s); bkDevUnitSync(s); bkSave(s); return true; }, [types, extra]);
  await set(MIX);
  const m = await p.evaluate(() => { const s = bkLoad(), sc = bkDevUnitSchedule(), x = bkDevV09(), c = bkCalc(); return { s: { units: s.units, rent: s.avgRent, lu: s.leaseupMonths }, sc, x: { lu: x.luMo, co: x.co, stab: x.stab }, egi: c.egi }; });
  check('the unit mix sets the deal\'s units (150) and its average rent (weighted by units)', m.s.units === 150 && Math.abs(m.s.rent - (60 * 1800 + 60 * 2300 + 30 * 2900) / 150) < 1e-9, JSON.stringify(m.s));
  check('the lease-up period and stabilisation month come from the schedule (engine and schedule agree)', m.x.lu === m.sc.luMo && m.x.stab === m.x.co + m.sc.luMo && m.sc.luMo > 0 && !m.sc.incomplete && m.s.lu === m.sc.baseLuMo, JSON.stringify(m.x) + ' ' + m.sc.luMo);
  const inv = m.sc.months.map((r, j) => ({ j, r })), U = m.sc.units;
  const ok1 = inv.every(({ r }) => r.byType.every((t, ti) => t.delivered >= t.commenced - 1e-9 && t.commenced >= t.paying - 1e-9 && t.commenced <= m.sc.types[ti].units + 1e-9 && t.signed <= m.sc.types[ti].units + 1e-9 && t.paying >= -1e-9));
  check('for every type and month: units delivered ≥ moved in ≥ paying rent, and nothing exceeds the type\'s units', ok1);
  check('occupancy never falls, and units moved in never exceed units delivered', inv.every(({ r }, k) => (k === 0 || r.occ >= inv[k - 1].r.occ - 1e-12) && r.commenced <= r.delivered + 1e-9));
  const stabJ = m.sc.months.findIndex(r => r.occ >= m.sc.stabTarget - 1e-9);
  check('stabilisation is the first month occupied reaches the target (100% of units), and the schedule stops there', stabJ === m.sc.luMo && m.sc.months.length === m.sc.luMo + 1, stabJ + ' / ' + m.sc.luMo);
  const rr = await p.evaluate(() => { const x = bkDevV09(), sc = bkDevUnitSchedule(), c = bkCalc(); return x.leaseupRamp.map((r, j) => ({ egi: r.egi, want: c.egi * Math.min(1, sc.months[j].payOcc / sc.stabTarget) / 12, occ: r.occ, pocc: sc.months[j].occ })); });
  check('lease-up income is the stabilised EGI times the rent-weighted share of units paying rent, month by month', rr.every(r => Math.abs(r.egi - r.want) < 1e-6) && rr.length === m.sc.luMo, rr.length + ' months');
  check('income at stabilisation is the deal\'s stabilised EGI (the last lease-up month is at or below it)', rr[rr.length - 1].egi <= m.egi / 12 + 1e-6 && rr[rr.length - 1].egi > 0);
  const del = await p.evaluate(() => bkDevUnitSchedule().months.map(r => r.byType.map(t => t.delivered)));
  check('phased delivery: each type is delivered at its own pace (1 BR 20 a month from CO, 2 BR 15 a month from month 1, 3 BR 10 a month from month 3)', del[0][0] === 20 && del[1][0] === 40 && del[1][1] === 15 && del[2][0] === 60 && del[2][2] === 0 && del[3][2] === 10 && del[4][2] === 20, JSON.stringify(del.slice(0, 5)));
  const mv = await p.evaluate(() => { const sc = bkDevUnitSchedule(); return sc.months.map(r => r.byType.map(t => [t.signed, t.commenced, t.paying])); });
  check('sign-to-move-in lag and free rent delay income, not signings: with a 1-month lag the 1 BR moves in a month after it signs, and pays a month after it moves in', mv[1][0][1] <= mv[0][0][0] + 1e-9 && mv[2][0][2] <= mv[1][0][1] + 1e-9 && mv[1][0][2] <= mv[0][0][1] + 1e-9);

  /* ---- 4. the schedule drives the economics ---- */
  const base = await p.evaluate((src) => eval('(' + src + ')')(), window_SNAP);
  const faster = await p.evaluate((src) => { const s = bkLoad(); s.devLeaseup.types = s.devLeaseup.types.map(t => Object.assign({}, t, { absorbPerMo: t.absorbPerMo * 2 })); bkSave(s); bkDevUnitSync(s); bkSave(s); return eval('(' + src + ')')(); }, window_SNAP);
  const slower = await p.evaluate((src) => { const s = bkLoad(); s.devLeaseup.types = s.devLeaseup.types.map(t => Object.assign({}, t, { absorbPerMo: t.absorbPerMo / 4 })); bkSave(s); bkDevUnitSync(s); bkSave(s); return eval('(' + src + ')')(); }, window_SNAP);
  check('faster absorption stabilises sooner and returns more; slower absorption stabilises later and returns less (levered IRR)', faster.lu < base.lu && base.lu < slower.lu && faster.irr > base.irr && base.irr > slower.irr, [faster.lu, base.lu, slower.lu].join('<') + ' IRR ' + [faster.irr, base.irr, slower.irr].map(v => (v * 100).toFixed(2)).join(' > '));
  await set(MIX);
  const rent = await p.evaluate(() => { const x = bkDevV09(), m = bkMonthlyReturns(), lu = x.leaseupRamp; const rows = m.rows.filter(r => r.m >= x.co && r.m < x.stab); return { ok: rows.every((r, j) => Math.abs(r.egi - lu[j].egi) < 1e-6), n: rows.length, lu: lu.length, st: m.rows[x.stab - 1 + 1] ? m.rows[x.stab].egi : 0 }; });
  check('the development cash flow\'s lease-up months carry the unit schedule\'s income, and income after stabilisation is the stabilised figure', rent.ok && rent.n === rent.lu && rent.st > 0, JSON.stringify(rent));
  const opx = await p.evaluate(() => { const full = bkDevV09().leaseupRamp.reduce((a, r) => a + r.after, 0); const s = bkLoad(); s.devLeaseup.opexBasis = 'delivered'; bkSave(s); const dl = bkDevV09().leaseupRamp.reduce((a, r) => a + r.after, 0); s.devLeaseup.opexBasis = 'full'; bkSave(s); return { full, dl }; });
  check('with operating costs following deliveries, lease-up NOI is higher (undelivered units carry no fixed costs) than with full costs from completion', opx.dl > opx.full, Math.round(opx.full) + ' → ' + Math.round(opx.dl));
  const mgt = await p.evaluate(() => { const x = bkDevV09(), c = bkCalc(), s = bkLoad(), r = x.leaseupRamp[2]; return Math.abs((r.egi - r.egi * s.mgmtPct - (c.total - c.mgmt) / 12 - s.reserves / 12) - r.after) < 1e-6; });
  check('lease-up NOI = income less fixed costs, the management fee on income, and reserves', mgt);

  /* ---- 5. sources and uses with a real shortfall ---- */
  const slow = await p.evaluate(() => { const s = bkLoad(); s.devLeaseup.types = s.devLeaseup.types.map(t => Object.assign({}, t, { rent: t.rent * 0.5, absorbPerMo: t.absorbPerMo / 6, freeMonths: 3 })); bkSave(s); bkDevUnitSync(s); bkSave(s);
    const x = bkDevV09(), f = bkDevFundingV10(), M = f.months, S = k => M.reduce((a, z) => a + (z[k] || 0), 0); const short = {}; x.leaseupRamp.forEach(r => { short[r.mo] = Math.max(0, -r.after); });
    const leaseMonths = M.filter(z => z.lease > 1e-6).map(z => z.mo), shortMonths = Object.keys(short).filter(k => short[k] > 1e-6).map(Number);
    return { def: x.leaseDef, lease: S('lease'), rowErr: Math.max(...M.map(z => Math.abs(z.loanDraw + z.eq + z.overflow - z.need))), roll: Math.max(...M.map(z => Math.abs(z.end - (z.beg + z.capInt + z.loanDraw)))), needTie: S('need') - (S('land') + S('hard') + S('soft') + S('lease') + S('fees')), tot: S('loanDraw') + S('eq') + S('overflow') - S('need'), lm: leaseMonths, sm: shortMonths, lev: f.levered, cap: S('need') + S('capInt') }; });
  check('a slow lease-up produces a positive operating shortfall that is added to the project cost in full', slow.def > 1000 && Math.abs(slow.lease - slow.def) < 1, Math.round(slow.def) + ' vs funded ' + Math.round(slow.lease));
  check('the shortfall is funded in the months it occurs (the months with negative NOI), not spread evenly', slow.lm.length > 0 && slow.lm.every(mo => slow.sm.includes(mo) || mo > Math.max(...slow.sm)), JSON.stringify(slow.lm.slice(0, 6)) + ' vs ' + JSON.stringify(slow.sm.slice(0, 6)));
  check('sources and uses still balance with unit-level lease-up: every month\'s draws fund the need, the need adds to the cost ladder, totals tie, the loan rolls forward, all-in cost = need + capitalised interest', slow.rowErr < 0.01 && Math.abs(slow.needTie) < 1 && Math.abs(slow.tot) < 1 && slow.roll < 0.01 && Math.abs(slow.lev - slow.cap) < 1, JSON.stringify({ r: slow.rowErr, n: slow.needTie, t: slow.tot, ro: slow.roll }));

  /* ---- 6. different mixes: rent weighting ---- */
  const wt = await p.evaluate(() => { const mk = (first) => { const hi = { name: 'Hi', units: 50, rent: 4000, deliverStart: 0, deliverPerMo: 0, marketStart: 0, absorbPerMo: first === 'hi' ? 10 : 2, preleased: 0, commenceLag: 0, freeMonths: 0 }, lo = { name: 'Lo', units: 50, rent: 1000, deliverStart: 0, deliverPerMo: 0, marketStart: 0, absorbPerMo: first === 'hi' ? 2 : 10, preleased: 0, commenceLag: 0, freeMonths: 0 }; const s = bkLoad(); s.devLeaseup = { mode: 'units', types: [hi, lo] }; bkSave(s); bkDevUnitSync(s); bkSave(s); const sc = bkDevUnitSchedule(); return { occ: sc.months[2].occ, pay: sc.months[2].payOcc, lu: sc.luMo, rent: bkLoad().avgRent }; }; return { hi: mk('hi'), lo: mk('lo') }; });
  check('the same units and the same unit-count occupancy earn more rent when the expensive units lease first (income is rent-weighted)', Math.abs(wt.hi.occ - wt.lo.occ) < 1e-9 && wt.hi.pay > wt.lo.pay + 0.05 && wt.hi.lu === wt.lo.lu && Math.abs(wt.hi.rent - 2500) < 1e-9, JSON.stringify(wt));

  /* ---- 7. scenarios, warnings, editing ---- */
  await set(MIX);
  const st = await p.evaluate((src) => { const b0 = bkDevUnitSchedule().baseLuMo; const r = bkRunWith({ leaseupMonths: b0 + 6 }, () => ({ lu: bkDevV09().luMo, irr: bkMonthlyReturns().irr })); const r0 = bkRunWith({}, () => ({ lu: bkDevV09().luMo, irr: bkMonthlyReturns().irr })); return { b0, r, r0 }; }, window_SNAP);
  check('a lease-up scenario (6 months slower, set through the lease-up months input) stretches the unit absorption and lowers the return', Math.abs(st.r.lu - (st.b0 + 6)) <= 1 && st.r.irr < st.r0.irr && st.r0.lu === st.b0, JSON.stringify(st));
  const wn = await p.evaluate(() => { const s = bkLoad(); s.devLeaseup = { mode: 'units', types: [{ name: 'Studio', units: 40, rent: 1500, absorbPerMo: 0 }] }; bkSave(s); const sc = bkDevUnitSchedule(); return { inc: sc.incomplete, w: sc.warnings, lu: bkDevV09().luMo }; });
  check('units that are never leased (no absorption) are flagged, and the project is not declared stabilised', wn.inc === true && wn.w.length >= 1 && /never/.test(wn.w.join(' ')), JSON.stringify(wn).slice(0, 200));
  await set(MIX);
  const ed = await p.evaluate(() => { bkDevUnitField(0, 'units', '100'); bkDevUnitField(0, 'rent', '$2,000'); bkDevUnitField(1, 'name', 'Two bed'); const s = bkLoad(); const t = s.devLeaseup.types; const U = 100 + 60 + 30, W = 100 * 2000 + 60 * 2300 + 30 * 2900; bkDevUnitAdd(); const n1 = bkLoad().devLeaseup.types.length; bkDevUnitRemove(3); const n2 = bkLoad().devLeaseup.types.length; return { u: s.units, ok: s.units === U && Math.abs(s.avgRent - W / U) < 1e-9, name: t[1].name, n1, n2 }; });
  check('editing a type updates the unit count and weighted average rent; types can be added and removed; names are kept', ed.ok && ed.name === 'Two bed' && ed.n1 === 4 && ed.n2 === 3, JSON.stringify(ed));
  const back = await p.evaluate((src) => { bkDevUnitMode('simple'); return { on: bkDevUnitOn(), lu: bkDevV09().luMo, s: bkLoad().leaseupMonths }; }, window_SNAP);
  check('switching back to the simple ramp turns the unit schedule off (the lease-up months it derived stay as the simple ramp\'s input)', back.on === false && back.lu === back.s);

  /* ---- 8. the sheet ---- */
  await set(MIX);
  const pg = await p.evaluate(async () => { showSheet('Dev Lease-Up'); await new Promise(r => setTimeout(r, 900)); const v = document.querySelector('#viewport'); return { t: v.innerText, rows: v.querySelectorAll('tr.input input[type=number]').length, svg: !!v.querySelector('svg[aria-label^="Lease-up"]'), inputs: v.querySelectorAll('input').length }; });
  check('the Dev Lease-Up sheet shows the unit-type table (editable), the settings, the occupancy chart and the month-by-month table', /Unit mix and lease-up schedule/.test(pg.t) && pg.rows >= 18 && pg.svg && /Month by month/.test(pg.t) && /Lease-up period/i.test(pg.t) && /stabilised/.test(pg.t), pg.rows + ' inputs');
  const pg2 = await p.evaluate(async () => { bkDevUnitMode('simple'); showSheet('Dev Lease-Up'); await new Promise(r => setTimeout(r, 700)); return document.querySelector('#viewport').innerText; });
  check('with the simple ramp the sheet says so and offers the by-unit-type option', /Simple ramp is in use/.test(pg2) && /By unit type/.test(pg2));
  const pg3 = await p.evaluate(async (d) => { bkCreateNewDeal(d); showSheet('Dev Lease-Up'); await new Promise(r => setTimeout(r, 700)); return document.querySelector('#viewport').innerText; }, Object.assign({}, A));
  check('an acquisition deal is told this applies to development deals', /development deals/.test(pg3));
  check('no page errors', p.errs.length === 0, p.errs.slice(0, 2).join(' | '));
  await b.close(); console.log(checks + ' checks, ' + fails + ' failures'); process.exit(fails ? 1 : 0);
})();
