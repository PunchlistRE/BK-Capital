// Lease rollover defaults (owner-approved, November 2026), treated like the tax-rate and land defaults. With no rollover assumptions the lease engine uses its own (65% renewal, 6 months downtime, TI $20/$5,
// commissions 6%/3%), and opening the Tenants page saves them into the deal. They are now labelled the model's defaults, unconfirmed until the user confirms or replaces them, with a Model Check while they are;
// only for deals with commercial tenant leases. No calculation changes and no entered value is overwritten.
//   node audit/rollover_defaults_test.js index.html
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); const path = require('path');
const A = require(path.join(__dirname, 'deal.js'));
const T = (o) => Object.assign({ tenant: 'Clinic', suite: 'G2', sf: 5000, status: 'Occupied', start: '2026-06-01', end: '2029-05-31', rent: 36, bump: 0.03, mkt: 40, recType: 'NNN', recFixed: 0 }, o);
const LEASES = { commLeaseModel: true, commercialArea: 8000, leases: [T(), T({ tenant: 'Cafe', suite: 'G1', sf: 3000, end: '2028-12-31', rent: 42 })] };
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  let checks = 0, fails = 0; const check = (n, ok, d) => { checks++; if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? '  [' + String(d).slice(0, 500) + ']' : '')); };
  const open = async (x) => { const ctx = await b.newContext({ viewport: { width: 1300, height: 1000 } }), p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
    await p.route(/supabase\.co|vercel\.app|fonts\.g|cdn\.jsdelivr|newyorkfed/, r => r.abort()); await p.goto('file://' + path.resolve(process.argv[2])); await p.waitForTimeout(700);
    await p.evaluate(([d, x]) => { document.documentElement.classList.add('bk-auth-ok'); bkCreateNewDeal(d); const s = bkLoad(); delete s.rolloverAssumptions; Object.assign(s, x || {}); bkSave(s); }, [A, x || null]); return p; };
  const res = (p) => p.evaluate(() => { const m = bkMonthlyReturns(); return JSON.stringify([m.irr, m.moic, m.dist, bkCalc().noi]); });
  const st = (p, k) => p.evaluate((k) => { const r = bkRolloverStatus(k); return r.state + '|' + r.source; }, k);
  const rule = (p) => p.evaluate(() => { const c = bkConflicts().find(x => x.id === 'lease.rollover-provisional'); return c ? { level: c.level, msg: c.message, why: c.why } : null; });
  const KEYS = ['renewalProbability', 'downtimeMonths', 'tiNewPerSF', 'tiRenewalPerSF', 'lcNewPct', 'lcRenewalPct'];

  /* ---- a deal without commercial leases: not asked ---- */
  const n = await open();
  const na = await n.evaluate(() => ({ ap: bkRolloverApplies(), prov: bkRolloverProvisional() }));
  check('a deal with no commercial tenant leases is not asked about rollover (the assumptions touch nothing)', !na.ap && na.prov.length === 0 && (await rule(n)) === null);

  /* ---- with leases: each is the model's default, unconfirmed ---- */
  const p = await open(LEASES);
  const s0 = await Promise.all(KEYS.map(k => st(p, k)));
  check('with commercial leases and nothing entered, all six are provisional: "Model default, not entered"', s0.every(x => x === 'provisional|Model default, not entered'), s0.join(' ; '));
  const r0 = await rule(p);
  check('a Model Check (a warning, never blocking) names each default and its value', r0 && r0.level === 'WARN' && /renewal probability 65%/.test(r0.msg) && /downtime 6 months/.test(r0.msg) && /new-lease TI \$20\/SF/.test(r0.msg) && /renewal TI \$5\/SF/.test(r0.msg) && /new-lease commission 6%/.test(r0.msg) && /renewal commission 3%/.test(r0.msg), r0 && r0.msg);
  check('it explains what they set (renewal, downtime, TI and commissions on expiry), that the cash flow after the first expiry is provisional, and that they need support', r0 && /renews/.test(r0.why) && /empty/.test(r0.why) && /provisional/.test(r0.why) && /leasing comparables/.test(r0.why), r0 && r0.why.slice(0, 200));
  const rd = await p.evaluate(() => ({ can: bkDealReadiness().canCalculate, f: bkDealFindings(bkLoad(), { measure: false }).findings.filter(f => /lease\.rollover-provisional/.test(f.rule)).map(f => [f.tier, f.cls]) }));
  check('it blocks nothing, and the review lists it once, as a warning', rd.can === true && rd.f.length === 1 && rd.f[0][0] === 4, JSON.stringify(rd));
  const base = await res(p);
  check('the deal calculates', JSON.parse(base)[3] > 0, base);

  /* ---- the pages that draw the rollover table save the defaults (bkEnsureV16, src/024): still the model's, and the numbers do not move ---- */
  const pg = await p.evaluate(async () => { bkEnsureV16(); showSheet('Tenants'); await new Promise(r => setTimeout(r, 900)); const v = document.querySelector('#viewport'); return { panel: !!v.querySelector('.bk-ro-panel'), rows: v.querySelectorAll('.bk-ro-panel [data-bk-ro]').length, chips: [...v.querySelectorAll('.bk-ro-panel .status-chip')].map(c => c.textContent.trim()), btn: v.querySelectorAll('.bk-ro-panel button[onclick*="bkRolloverConfirm(\'"]').length, t: v.innerText, saved: bkLoad().rolloverAssumptions }; });
  const s1 = await Promise.all(KEYS.map(k => st(p, k)));
  check('the Tenants page shows all six with their status, source, what each affects, a Confirm button each and the caution that they need support', pg.panel && pg.rows === 6 && pg.chips.filter(c => c === 'Provisional').length === 6 && pg.btn === 6 && /share of expiring leases expected to renew/.test(pg.t) && /not a market study/.test(pg.t), JSON.stringify(pg.chips));
  check('after the page saves the defaults they are still the model\'s: "Model default (saved earlier), not yet confirmed by you"', pg.saved && pg.saved.renewalProbability === 0.65 && s1.every(x => x === 'provisional|Model default (saved earlier), not yet confirmed by you'), s1.join(' ; '));
  check('saving them changed no figure (the engine already used these values)', (await res(p)) === base);

  /* ---- confirming one, then all ---- */
  const q = await open(LEASES);
  await q.evaluate(() => bkRolloverConfirm('renewalProbability'));
  const c1 = await Promise.all(KEYS.map(k => st(q, k)));
  check('confirming one (renewal probability) marks it "Confirmed by you" and leaves the other five as the model\'s defaults, provisional (not turned into blanks)', c1[0] === 'confirmed|Confirmed by you' && c1.slice(1).every(x => x === 'provisional|Model default (saved earlier), not yet confirmed by you'), c1.join(' ; '));
  check('and changes no figure', (await res(q)) === base);
  await q.evaluate(() => bkRolloverConfirm());
  const c2 = await Promise.all(KEYS.map(k => st(q, k)));
  check('confirming all marks every one "Confirmed by you", stores the confirmation and the Model Check goes quiet', c2.every(x => x === 'confirmed|Confirmed by you') && (await rule(q)) === null && await q.evaluate(() => Object.keys(bkLoad()._rolloverConfirmed).length === 6), c2.join(' ; '));
  check('the figures are identical provisional or confirmed', (await res(q)) === base);

  /* ---- entered and blank values are the user's ---- */
  const u = await open(Object.assign({}, LEASES, { rolloverAssumptions: { renewalProbability: 0.75, downtimeMonths: 6, tiNewPerSF: 20, tiRenewalPerSF: 5, lcNewPct: 0.06, lcRenewalPct: 0.03 } }));
  check('a value the user entered (75% renewal) is theirs: "Entered by you"; the ones still equal to the default stay provisional', (await st(u, 'renewalProbability')) === 'confirmed|Entered by you' && (await st(u, 'downtimeMonths')) === 'provisional|Model default (saved earlier), not yet confirmed by you');
  await u.evaluate(async () => { showSheet('Tenants'); await new Promise(r => setTimeout(r, 700)); });
  check('opening the page never overwrites it', await u.evaluate(() => bkLoad().rolloverAssumptions.renewalProbability === 0.75));
  const bl = await open(Object.assign({}, LEASES, { rolloverAssumptions: {} }));
  const sb = await Promise.all(KEYS.map(k => st(bl, k)));
  check('assumptions left blank (or a deal started blank) are the user\'s choice, said plainly: "Left blank by you: none assumed", not flagged', sb.every(x => x === 'confirmed|Left blank by you: none assumed') && (await rule(bl)) === null, sb[0]);
  check('no page errors', [n, p, q, u, bl].every(x => x.errs.length === 0), [n, p, q, u, bl].map(x => x.errs.join('|')).join(' '));
  console.log('rollover defaults: ' + checks + ' checks, ' + fails + ' failures'); await b.close(); process.exit(fails ? 1 : 0);
})();
