// Loan sizing: one rule (bkSizeLoan, src/130a) shared by Refi / Recap and the Refinancing Analysis. The extraction must not move a number in either tool.
//   node audit/loan_sizing_test.js index.html                      check a build
//   node audit/loan_sizing_test.js --record build.html             record what both tools do, from a build made before the rule was extracted
//   node audit/loan_sizing_test.js --diff base.html new.html [n]   run the scenarios and n seeded random ones (default 300 + 1500) through two builds in one browser and list every difference, bit for bit
// A check has three parts. (1) The rule against an independent model (audit/sizing_ref.py): seeded random cases, each test binding on its own, three different limits, ties, an
// interest-only and a derived debt service, a requested amount, and invalid inputs (zero, negative, missing, not a number). (2) Both tools on designed scenarios that make every
// test bind, tie, run interest-only, take a requested amount, or lack an input: the engine's full output (its numbers to 9 significant digits: the last bits of a float differ between Chromium versions) and the rendered
// sheet and report (text, exactly) are compared with what the tools produced BEFORE the rule was extracted (audit/fixtures/loan_sizing_golden.json, recorded from main at 61b71ef; the text re-recorded once for the House/Lender DSCR names, every number unchanged); (3) both tools really go through the shared rule.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); const path = require('path'); const fs = require('fs'); const os = require('os'); const cp = require('child_process'); const crypto = require('crypto');
const A = require(path.join(__dirname, 'deal.js')), H = require(path.join(__dirname, 'devdeal.js')), D = require(path.join(__dirname, 'refideal.js'));
const GOLD = path.join(__dirname, 'fixtures', 'loan_sizing_golden.json'); const RECORDED_FROM = 'main at 61b71ef (before the sizing rule was extracted); the sheet, report and verdict text re-recorded for the House/Lender DSCR names (November 2026), after checking every number in all 67 scenarios is unchanged from the 61b71ef record';
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex').slice(0, 24);
/* The engine's numbers are recorded and compared to 9 significant digits (anything under 1e-7 counts as 0): the last bits of a float differ between Chromium versions (CI runs 131, the results were recorded on 141), so a digest of the exact bits
   fails on a build that has not changed at all. A real change to a sizing figure moves it by far more than that. Two builds in ONE browser are compared bit for bit by --diff. */
const NUMBERS_NOTE = 'engine numbers to 9 significant digits, under 1e-7 as 0; the sheet and the report exactly';
const canon = (s) => { try { return JSON.stringify(JSON.parse(s), (k, v) => typeof v === 'number' && Number.isFinite(v) ? (Math.abs(v) < 1e-7 ? 0 : Number(v.toPrecision(9))) : v); } catch (e) { return String(s); } };
const unser = (s) => JSON.parse(s, (k, v) => (typeof v === 'string' && /^#(NaN|-?Infinity)$/.test(v) ? Number(v.slice(1)) : v));

/* ------------------------------------------------------------------ the designed scenarios */
const ACQ = { purchasePrice: 19800000 };
const R = (r) => ({ _refi: r });                                                                  /* Refi / Recap's own inputs */
const o = (n, x, e, d) => ({ n, d: d || A, x: (d === H ? {} : Object.assign({}, ACQ)), e: e || {}, set: x || {} });
const OLD = [   /* Refi / Recap on the 120-unit acquisition: year 4 of a 5-year hold is the default */
  o('default', {}, { bind: 'DSCR', distinct: true }),
  o('ltv-binds', R({ maxLTV: 0.30 }), { bind: 'LTV' }), o('dscr-binds', R({ minDSCR: 2.0 }), { bind: 'DSCR' }), o('dy-binds', R({ minDebtYield: 0.20 }), { bind: 'Debt yield' }),
  o('three-different-limits-ltv-lowest', R({ maxLTV: 0.50, minDSCR: 1.10, minDebtYield: 0.07 }), { bind: 'LTV', distinct: true }),
  o('three-different-limits-dy-lowest', R({ maxLTV: 0.80, minDSCR: 1.10, minDebtYield: 0.12 }), { bind: 'Debt yield', distinct: true }),
  o('year-1', R({ year: 1 })), o('year-2', R({ year: 2 })), o('year-3', R({ year: 3 })),
  o('year-0-invalid', R({ year: 0 }), { noSelected: true }), o('year-5-invalid', R({ year: 5 }), { noSelected: true }), o('year-9-invalid', R({ year: 9 }), { noSelected: true }),
  o('rate-0', R({ rate: 0 })), o('rate-12-percent', R({ rate: 0.12 })),
  o('amortization-0', R({ amort: 0 })), o('amortization-25', R({ amort: 25 })), o('amortization-40', R({ amort: 40 })), o('amortization-27.3-whole-months', R({ amort: 27.3 })), o('amortization-27.5', R({ amort: 27.5 })),
  o('appraisal-cap-0', R({ appraisalCap: 0 })), o('appraisal-cap-20-percent', R({ appraisalCap: 0.20 })), o('exit-cap-blank', { exitCap: '' }),
  o('ltv-limit-0', R({ maxLTV: 0 })), o('dscr-limit-0', R({ minDSCR: 0 })), o('dy-limit-0', R({ minDebtYield: 0 })), o('ltv-limit-negative', R({ maxLTV: -0.5 })),
  o('invalid-entries-fall-back-to-defaults', R({ maxLTV: 'abc', rate: '', amort: 'x', year: 'y' })),
  o('costs-and-penalties', R({ costsPct: 0.03, prepayPct: 0.02, exitPenaltyPct: 0 })),
  o('hold-8-years', { holdYears: 8 }), o('hold-3-years', { holdYears: 3 }),
  o('no-debt', { debtEnabled: false }, { none: true }), o('development-deal', {}, { none: true }, H)
];
const ALTS = [{ name: 'LTV-bound', lenderMaxLTV: 0.30 }, { name: 'DSCR-bound', lenderMinDSCR: 2.5 }, { name: 'DY-bound', lenderMinDY: 0.30 }, { name: 'Requested-bound', newLoanAmount: 1000000 },
  { name: 'IO 3 years', newLoanIO: 3, newLoanAmort: 25 }, { name: 'Interest-only term', newLoanAmort: 0 }, { name: 'Inherits everything' }];
const nw = (n, x, e) => ({ n, d: D, x: {}, e: e || {}, set: x || {} });
const NEW = [   /* the Refinancing Analysis on the 40-unit owned property (NOI $677,008, value NOI / 6% cap) */
  nw('default', {}, { bind: 'Debt service coverage', distinct: true }),
  nw('ltv-binds', { lenderMaxLTV: 0.40 }, { bind: 'Loan to value' }), nw('dscr-binds-hard', { lenderMinDSCR: 2.0 }, { bind: 'Debt service coverage' }), nw('dy-binds', { lenderMinDY: 0.12 }, { bind: 'Debt yield' }),
  nw('requested-binds', { newLoanAmount: 5000000 }, { bind: 'Amount requested' }), nw('requested-above-every-test', { newLoanAmount: 99000000 }, { bind: 'Debt service coverage' }),
  nw('requested-only', { lenderMaxLTV: '', lenderMinDSCR: '', lenderMinDY: '', newLoanAmount: 5000000 }, { bind: 'Amount requested', tests: 1 }),
  nw('three-different-limits-ltv-lowest', { lenderMaxLTV: 0.50, lenderMinDSCR: 1.10, lenderMinDY: 0.07 }, { bind: 'Loan to value', distinct: true }),
  nw('three-different-limits-dy-lowest', { lenderMaxLTV: 0.80, lenderMinDSCR: 1.10, lenderMinDY: 0.10 }, { bind: 'Debt yield', distinct: true }),
  nw('tie-ltv-and-dy', { currentValue: 5416064, lenderMaxLTV: 0.5, lenderMinDY: 0.25, lenderMinDSCR: 1.0 }, { bind: 'Loan to value', tie: ['Loan to value', 'Debt yield'] }),
  nw('tie-dy-and-requested', { lenderMaxLTV: '', lenderMinDSCR: '', lenderMinDY: 0.25, newLoanAmount: 2708032 }, { bind: 'Debt yield', tie: ['Debt yield', 'Amount requested'] }),
  nw('interest-only-2-years', { newLoanIO: 2 }, { bind: 'Debt service coverage', io: true }), nw('interest-only-whole-term', { newLoanAmort: 0 }, { fullIO: true }), nw('amortization-blank', { newLoanAmort: '' }, { fullIO: true }),
  nw('amortization-27.3-not-rounded', { newLoanAmort: 27.3 }, { months: 27.3 * 12 }), nw('amortization-27.5', { newLoanAmort: 27.5 }, { months: 330 }), nw('amortization-40', { newLoanAmort: 40 }),
  nw('lender-noi-after-reserves', { lenderNoiBasis: 'after' }), nw('value-entered', { currentValue: 12000000 }), nw('payoff-exceeds-loan', { exLoanBalance: 9000000 }),
  nw('alternatives-each-test-binding', { refiScenarios: ALTS }, { alts: ['Loan to value', 'Debt service coverage', 'Debt yield', 'Amount requested'] }),
  nw('huge-numbers', { exLoanBalance: 4.5e11, newLoanAmount: 1e12, currentValue: 5e12 }),
  nw('rate-blank', { newLoanRate: '' }, { notOk: true, missing: 'interest rate' }), nw('rate-text', { newLoanRate: 'abc' }, { notOk: true, missing: 'interest rate' }), nw('rate-zero', { newLoanRate: 0 }, { notOk: true, missing: 'interest rate' }),
  nw('costs-blank', { newLoanCosts: '' }, { notOk: true, missing: 'refinance costs' }),
  nw('no-lender-test-or-amount', { lenderMaxLTV: '', lenderMinDSCR: '', lenderMinDY: '' }, { notOk: true, missing: 'a lender test' }),
  nw('ltv-limit-without-a-value', { currentValue: '', valCapRate: '' }, { notOk: true, missing: 'a current value or cap rate' }),
  nw('no-value-and-no-ltv-limit', { currentValue: '', valCapRate: '', lenderMaxLTV: '' }, { bind: 'Debt service coverage' }),
  nw('noi-not-positive', { taxes: 6000000 }, { notOk: true, missing: 'positive NOI' }),
  nw('limits-negative', { lenderMaxLTV: -0.7, lenderMinDSCR: -1.25, lenderMinDY: -0.08 }, { notOk: true, missing: 'a lender test' }), nw('limits-zero', { lenderMaxLTV: 0, lenderMinDSCR: 0, lenderMinDY: 0 }, { notOk: true, missing: 'a lender test' }),
  nw('limits-text', { lenderMaxLTV: 'abc', lenderMinDSCR: 'x', lenderMinDY: '??' }, { notOk: true, missing: 'a lender test' }), nw('dscr-limit-infinity', { lenderMinDSCR: 'Infinity' }, { bind: 'Loan to value' }),
  nw('existing-balance-blank', { exLoanBalance: '' }, { noMain: true })
];

/* ------------------------------------------------------------------ seeded random scenarios (for --diff) */
function rng(seed){ return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function randomOld(count, seed){ const r = rng(seed), u = (a, b) => a + (b - a) * r(), pk = (a) => a[Math.floor(r() * a.length)], out = [];
  for (let i = 0; i < count; i++){ const hold = pk([3, 4, 5, 6, 7, 8, 10]), x = { purchasePrice: Math.round(u(8e6, 30e6)), holdYears: hold, exitCap: +u(0.045, 0.075).toFixed(4) }, v = {};
    const maybe = (k, val, pz) => { if (r() < 0.55) v[k] = r() < (pz || 0) ? 0 : val; };
    maybe('year', pk([0, 1, 2, 3, 4, 5, 6, 7, 9])); maybe('appraisalCap', +u(0.04, 0.09).toFixed(4), 0.03); maybe('maxLTV', +u(0.3, 0.85).toFixed(3), 0.03); maybe('minDSCR', +u(1.0, 2.0).toFixed(3), 0.03);
    maybe('minDebtYield', +u(0.06, 0.2).toFixed(4), 0.03); maybe('rate', +u(0.03, 0.10).toFixed(4), 0.05); maybe('amort', pk([0, 15, 20, 25, 27.3, 30, 35, 40])); maybe('costsPct', +u(0, 0.04).toFixed(4)); maybe('prepayPct', +u(0, 0.03).toFixed(4)); maybe('exitPenaltyPct', +u(0, 0.03).toFixed(4));
    out.push({ n: 'rand-old-' + i, d: A, x: {}, e: {}, set: Object.assign({}, x, { _refi: v }) }); } return out; }
function randomNew(count, seed){ const r = rng(seed), u = (a, b) => a + (b - a) * r(), pk = (a) => a[Math.floor(r() * a.length)], out = [], blank = (p, val) => (r() < p ? '' : val);
  for (let i = 0; i < count; i++){ const x = { units: pk([12, 24, 40, 80, 150]), avgRent: Math.round(u(900, 3500)), vacancy: +u(0.03, 0.12).toFixed(3), taxes: Math.round(u(2e4, 3e5)), insurance: Math.round(u(1e4, 8e4)), rm: Math.round(u(1e4, 9e4)), utilities: Math.round(u(0, 6e4)),
      lenderNoiBasis: pk(['', 'after']), exLoanBalance: Math.round(u(1e6, 2e7)), exPrepay: Math.round(u(0, 3e5)), exLoanRate: +u(0.03, 0.08).toFixed(4), exLoanAmort: pk([20, 25, 30]),
      newLoanRate: blank(0.03, +u(0.04, 0.10).toFixed(4)), newLoanAmort: pk([0, '', 20, 25, 27.3, 30, 35, 40]), newLoanIO: pk([0, 0, 1, 2, 3, 5]), newLoanCosts: blank(0.03, Math.round(u(0, 2e5))),
      lenderMaxLTV: blank(0.2, +u(0.4, 0.85).toFixed(3)), lenderMinDSCR: blank(0.2, +u(1.0, 1.8).toFixed(3)), lenderMinDY: blank(0.3, +u(0.06, 0.14).toFixed(4)), newLoanAmount: blank(0.6, Math.round(u(1e6, 3e7))) };
    const v = r(); if (v < 0.45) { x.valCapRate = +u(0.045, 0.09).toFixed(4); x.currentValue = ''; } else if (v < 0.9) { x.currentValue = Math.round(u(3e6, 5e7)); } else { x.valCapRate = ''; x.currentValue = ''; }
    const na = pk([0, 0, 1, 2, 3]); x.refiScenarios = Array.from({ length: na }, (_, k) => { const a = { name: 'Alt ' + k }; ['newLoanRate', 'newLoanAmort', 'newLoanIO', 'lenderMaxLTV', 'lenderMinDSCR', 'lenderMinDY', 'newLoanAmount', 'newLoanCosts'].forEach(f => { if (r() < 0.35) a[f] = f === 'newLoanRate' ? +u(0.04, 0.10).toFixed(4) : f === 'newLoanAmort' ? pk([0, 20, 25, 30]) : f === 'newLoanIO' ? pk([0, 2, 3]) : f === 'lenderMaxLTV' ? +u(0.4, 0.85).toFixed(3) : f === 'lenderMinDSCR' ? +u(1, 1.8).toFixed(3) : f === 'lenderMinDY' ? +u(0.06, 0.14).toFixed(4) : f === 'newLoanAmount' ? Math.round(u(1e6, 3e7)) : Math.round(u(0, 2e5)); }); return a; });
    out.push({ n: 'rand-new-' + i, d: D, x: {}, e: {}, set: x }); } return out; }

/* ------------------------------------------------------------------ running a scenario in a page */
async function launch(build){ const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined }); const p = await b.newPage({ viewport: { width: 1400, height: 900 } }); p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
  await p.route(/supabase\.co|vercel\.app|fonts\.g|cdn\.jsdelivr/, r => r.abort()); await p.goto('file://' + path.resolve(build)); await p.waitForTimeout(700);
  await p.evaluate(() => { document.documentElement.classList.add('bk-auth-ok'); window.__ser = (v) => JSON.stringify(v, (k, x) => (typeof x === 'number' && !Number.isFinite(x) ? '#' + x : x)); }); p.b = b; return p; }
const OPEN = `(a) => { bkCreateNewDeal(a[0]); const s = bkLoad(); Object.assign(s, a[0], a[1]); bkSave(s); }`;
async function capture(p, kind, sc){
  try { return await capture2(p, kind, sc); } catch (e) { return { engine: 'ERR ' + String(e.message).split('\n')[0], sheet: 'ERR', report: 'ERR', key: 'null' }; } }
async function capture2(p, kind, sc){
  await p.evaluate(eval(OPEN), [sc.d, Object.assign({}, sc.x, sc.set)]);
  if (kind === 'old') return p.evaluate(() => { const r = bkRefi(), t = r && r.selected; const sheet = RENDERERS['Refi / Recap']();
    return { engine: __ser(r), sheet: __ser(sheet), key: __ser(r ? { valid: r.valid, year: t && t.year, caps: t ? [t.capLTV, t.capDSCR, t.capDY] : null, loan: t && t.newLoan, binding: t && t.binding, net: t && t.netCashOut, irr: t && t.irr, moic: t && t.moic, profit: t && t.profit } : null) }; });
  return p.evaluate(() => { const r = bkRefinance(), rest = Object.assign({}, r); delete rest.calc; const m = r.main;
    return { engine: __ser(rest), sheet: __ser(RENDERERS['Refinancing']()), report: __ser(RENDERERS['Refinance Report']()),
      key: __ser({ ok: r.ok, missing: r.missing.concat(m ? m.missing : []), loan: m && m.loan, raw: m && m.raw, binding: m && m.binding, tests: m ? m.tests.map(t => [t.name, t.loan]) : null, ds1: m && m.ds1, net: m && m.net, alts: r.alts.map(a => [a.name, a.binding, a.loan]) }) }; });
}
async function runSet(p, kind, list){ const res = {}; for (const sc of list) res[sc.n] = await capture(p, kind, sc); return res; }

/* ------------------------------------------------------------------ deep difference (for --diff) */
function deepDiff(a, b, pth, out){ if (out.length > 12) return; if (typeof a === 'number' && typeof b === 'number') { if (!Object.is(a, b) && !(Number.isNaN(a) && Number.isNaN(b))) out.push([pth, a, b, a !== 0 ? Math.abs((b - a) / a) : null]); return; }
  if (a && b && typeof a === 'object' && typeof b === 'object') { const ks = new Set(Object.keys(a).concat(Object.keys(b))); ks.forEach(k => deepDiff(a[k], b[k], pth + '.' + k, out)); return; } if (a !== b) out.push([pth, a, b, null]); }

(async () => {
  const args = process.argv.slice(2);
  if (args[0] === '--record') {
    const p = await launch(args[1]); const old = await runSet(p, 'old', OLD), nw2 = await runSet(p, 'new', NEW); const dig = (set, f) => Object.fromEntries(Object.entries(set).map(([k, v]) => [k, Object.assign({ engine: sha(canon(v.engine)), sheet: sha(v.sheet), key: unser(v.key) }, v.report ? { report: sha(v.report) } : {})]));
    fs.writeFileSync(GOLD, JSON.stringify({ recordedFrom: RECORDED_FROM, numbers: NUMBERS_NOTE, old: dig(old), new: dig(nw2) }, null, 1) + '\n'); console.log('recorded ' + Object.keys(old).length + ' Refi / Recap and ' + Object.keys(nw2).length + ' Refinancing scenarios; page errors: ' + p.errs.length); await p.b.close(); return; }
  if (args[0] === '--diff') {
    const count = Number(args[3]) || 300, oldL = OLD.concat(randomOld(count, 20260105)), newL = NEW.concat(randomNew(Math.round(count * 5), 20261105)); const res = [];
    for (const build of [args[1], args[2]]) { const p = await launch(build); const t0 = Date.now(); res.push({ old: await runSet(p, 'old', oldL), new: await runSet(p, 'new', newL), errs: p.errs.slice() }); console.log(build + ': ' + oldL.length + ' + ' + newL.length + ' scenarios in ' + Math.round((Date.now() - t0) / 1000) + ' s; page errors ' + p.errs.length); await p.b.close(); }
    for (const kind of ['old', 'new']) { const names = Object.keys(res[0][kind]); let same = 0, shown = 0, worst = 0; const fields = {};
      for (const n of names) { const a = res[0][kind][n], b = res[1][kind][n]; const parts = ['engine', 'sheet'].concat(kind === 'new' ? ['report'] : []); let diff = false;
        for (const f of parts) if (a[f] !== b[f]) { diff = true; const out = []; if (f === 'engine' && !/^ERR/.test(a[f]) && !/^ERR/.test(b[f])) deepDiff(unser(a[f]), unser(b[f]), '', out); else out.push([f + ' differs: ' + String(a[f]).slice(0, 60) + ' vs ' + String(b[f]).slice(0, 60)]); out.forEach(d => { fields[d[0]] = (fields[d[0]] || 0) + 1; if (d[3] !== null) worst = Math.max(worst, d[3]); }); if (shown++ < 6) console.log('  DIFF ' + kind + ' ' + n + ' ' + f + ' ' + JSON.stringify(out.slice(0, 4))); }
        if (!diff) same++; }
      console.log((kind === 'old' ? 'Refi / Recap' : 'Refinancing Analysis') + ': ' + same + ' of ' + names.length + ' scenarios identical (engine output, sheet' + (kind === 'new' ? ', report' : '') + ')' + (same < names.length ? '; differing fields: ' + JSON.stringify(fields) + '; largest relative difference ' + worst : '')); }
    return; }

  /* ------------------------------------------------------------------ check a build */
  const build = args[0]; let checks = 0, fails = 0; const check = (n, ok, d) => { checks++; if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? '  [' + String(d).slice(0, 400) + ']' : '')); };
  const p = await launch(build); const near = (a, b, t) => a === b || Math.abs(a - b) <= (t || 1e-12) * Math.max(1, Math.abs(b));
  check('the shared rule is on the page', await p.evaluate(() => typeof bkSizeLoan === 'function'));

  /* (1) the rule against an independent model */
  const r = rng(424242), u = (a, b) => a + (b - a) * r(), pk = (a) => a[Math.floor(r() * a.length)]; const cases = [];
  for (let i = 0; i < 6000; i++){ const c = { tests: pk([['ltv', 'dscr', 'dy'], ['ltv', 'dscr', 'dy'], ['ltv'], ['dscr'], ['dy'], ['ltv', 'dscr'], ['dscr', 'dy'], ['ltv', 'dy']]), noi: u(2e5, 6e6), value: u(2e6, 1.2e8), maxLTV: u(0.3, 0.85), minDSCR: u(1.0, 2.0), minDY: u(0.05, 0.2) };
    if (r() < 0.5) { c.rate = r() < 0.05 ? 0 : u(0.02, 0.12); c.amortYears = pk([15, 20, 25, 27.3, 27.5, 30, 35, 40]); c.roundMonths = r() < 0.5; } else { c.debtConstant = u(0.04, 0.12); }
    if (r() < 0.4) c.extra = [{ id: 'requested', loan: u(1e6, 5e7) }]; cases.push(c); }
  const tmp = path.join(os.tmpdir(), 'bk-sizing-' + process.pid + '.json'); fs.writeFileSync(tmp, JSON.stringify(cases));
  const want = JSON.parse(cp.execSync('python3 ' + JSON.stringify(path.join(__dirname, 'sizing_ref.py')) + ' ' + JSON.stringify(tmp)).toString()); fs.unlinkSync(tmp);
  const got = await p.evaluate((cs) => cs.map(c => bkSizeLoan(c)), cases);
  let bad = 0, firstBad = null, nearTie = 0; got.forEach((g, i) => { const w = want[i]; const capsOk = g.caps.length === w.caps.length && g.caps.every((c, k) => c.id === w.caps[k][0] && near(c.loan, w.caps[k][1])); const sorted = w.caps.map(c => c[1]).sort((x, y) => x - y);
    const tie = sorted.length > 1 && Math.abs(sorted[1] - sorted[0]) <= 1e-9 * Math.abs(sorted[0]); if (tie) nearTie++; const ok = capsOk && near(g.loan, w.loan) && (tie || g.binding === w.binding); if (!ok) { bad++; if (!firstBad) firstBad = JSON.stringify([cases[i], g, w]); } });
  check('independent model: ' + cases.length + ' seeded random cases (every subset of the three tests, derived and supplied debt service, whole-month and as-entered terms, zero rate, a requested amount): every cap, the lowest loan and the binding test agree', bad === 0, bad + ' differ; ' + firstBad);
  const one = (c) => p.evaluate((x) => bkSizeLoan(x), c);
  { const a = await one({ noi: 800000, value: 10000000, maxLTV: 0.5, minDSCR: 2, debtConstant: 0.1, minDY: 0.1 }), b = await one({ noi: 800000, value: 10000000, maxLTV: 0.5, minDSCR: 2, debtConstant: 0.1, minDY: 0.25 }), c = await one({ noi: 800000, value: 10000000, maxLTV: 0.3, minDSCR: 2, debtConstant: 0.1, minDY: 0.1 });
    check('each test binds on its own: DSCR ($4,000,000 < $5,000,000 < $8,000,000), debt yield ($3,200,000), LTV ($3,000,000)', a.binding === 'dscr' && a.loan === 4000000 && b.binding === 'dy' && b.loan === 3200000 && c.binding === 'ltv' && c.loan === 3000000, JSON.stringify([a.binding, a.loan, b.binding, b.loan, c.binding, c.loan])); }
  { const a = await one({ noi: 800000, value: 10000000, maxLTV: 0.5, minDSCR: 2, debtConstant: 0.1, minDY: 0.1 }); check('three different limits: the caps are all different, the loan is the lowest, nothing else is chosen', new Set(a.caps.map(c => c.loan)).size === 3 && a.loan === Math.min(...a.caps.map(c => c.loan)), JSON.stringify(a.caps)); }
  { const t1 = await one({ tests: ['ltv', 'dy'], noi: 1000, value: 8000, maxLTV: 0.5, minDY: 0.25 }), t2 = await one({ tests: ['dscr', 'dy'], noi: 1000, minDSCR: 1, debtConstant: 0.25, minDY: 0.25 }), t3 = await one({ tests: ['dy'], noi: 1000, minDY: 0.25, extra: [{ id: 'requested', loan: 4000 }] });
    check('ties go to LTV, then DSCR, then debt yield, then the added cap', t1.loan === 4000 && t1.binding === 'ltv' && t2.binding === 'dscr' && t3.binding === 'dy', [t1.binding, t2.binding, t3.binding].join()); }
  { const io = await one({ tests: ['dscr'], noi: 1000000, minDSCR: 1.25, debtConstant: 0.065 }), am = await one({ tests: ['dscr'], noi: 1000000, minDSCR: 1.25, rate: 0.065, amortYears: 30 }), rq = await one({ tests: [], extra: [{ id: 'requested', loan: 5e6 }] });
    check('interest-only sizing is NOI / DSCR / the rate ($12,307,692), amortizing sizing is smaller, and a requested amount alone is the loan', near(io.loan, 800000 / 0.065) && am.loan < io.loan && near(am.loan, 800000 / (12 * (0.065 / 12) / (1 - Math.pow(1 + 0.065 / 12, -360)))) && rq.loan === 5e6 && rq.binding === 'requested', [io.loan, am.loan, rq.loan].join()); }
  { const w = await one({ tests: ['dscr'], noi: 1000000, minDSCR: 1, rate: 0.06, amortYears: 27.3, roundMonths: true }), x = await one({ tests: ['dscr'], noi: 1000000, minDSCR: 1, rate: 0.06, amortYears: 27.3, roundMonths: false });
    const pv = (n) => 1000000 / 12 * (1 - Math.pow(1 + 0.005, -n)) / 0.005; check('the amortization is taken to whole months (328) when asked, and as entered (327.6 months) when not', near(w.loan, pv(328), 1e-13) && near(x.loan, pv(327.6), 1e-13) && w.loan !== x.loan, [w.loan, x.loan].join()); }
  { const z = await one({ tests: ['dscr'], noi: 1000000, minDSCR: 1, rate: 0, amortYears: 30 }), zr = await one({ tests: ['dscr'], noi: 1000000, minDSCR: 1, rate: 0, amortYears: 27.3, roundMonths: true }); check('at a zero rate the capacity is the annual amount x the years, as before', z.loan === 30000000 && zr.loan === 27300000, [z.loan, zr.loan].join()); }
  { const inv = await p.evaluate(() => { const s = (c) => { const x = bkSizeLoan(c); return [x.loan, x.binding, x.caps.map(k => k.loan)]; }; return { ltv0: s({ tests: ['ltv'], value: 1e7, maxLTV: 0 }), ltvNeg: s({ tests: ['ltv'], value: 1e7, maxLTV: -0.5 }), dscr0: s({ tests: ['dscr'], noi: 1e6, minDSCR: 0, debtConstant: 0.1 }), dy0: s({ tests: ['dy'], noi: 1e6, minDY: 0 }),
      nan: s({ noi: NaN, value: 1e7, maxLTV: 0.6, minDSCR: 1.25, rate: 0.06, amortYears: 30, minDY: 0.08 }), blank: s({ value: 1e7, noi: 1e6, minDSCR: 1.25, rate: 0.06, amortYears: 30, minDY: 0.08 }), none: s({ tests: [] }), amort0: s({ tests: ['dscr'], noi: 1e6, minDSCR: 1, rate: 0.06, amortYears: 0, roundMonths: true }) }; });
    check('invalid inputs are used as given, never guessed: a limit of zero allows nothing (LTV) or everything (DSCR, debt yield: infinite); a negative LTV is negative; a missing figure is not a number and the last test is named; no tests is no loan',
      inv.ltv0[0] === 0 && inv.ltv0[1] === 'ltv' && inv.ltvNeg[0] === -5000000 && inv.dscr0[0] === Infinity && inv.dy0[0] === Infinity && Number.isNaN(inv.nan[0]) && inv.nan[1] === 'dy' && Number.isNaN(inv.blank[0]) && inv.none[0] === null && inv.none[1] === null && inv.amort0[0] === 0, JSON.stringify(inv)); }

  /* (2) both tools against what they did before the rule was extracted */
  const gold = fs.existsSync(GOLD) ? JSON.parse(fs.readFileSync(GOLD)) : null; check('the recorded pre-extraction results are present', !!gold);
  const oldR = await runSet(p, 'old', OLD), newR = await runSet(p, 'new', NEW);
  for (const [kind, set, g, list] of [['Refi / Recap', oldR, gold && gold.old, OLD], ['Refinancing Analysis', newR, gold && gold.new, NEW]]) { const bad2 = []; for (const sc of list) { const x = set[sc.n], w = g && g[sc.n]; if (!w) { bad2.push(sc.n + ' (not recorded)'); continue; }
      const parts = ['engine', 'sheet'].concat(kind === 'Refinancing Analysis' ? ['report'] : []); const diff = parts.filter(f => (f === 'engine' ? sha(canon(x[f])) : sha(x[f])) !== w[f]); if (diff.length) bad2.push(sc.n + ': ' + diff.join('+') + ' differ; now ' + x.key + ' was ' + JSON.stringify(w.key)); }
    check(kind + ': all ' + list.length + ' designed scenarios give what they gave before the rule was extracted (the engine\'s full output to 9 significant digits' + (kind === 'Refi / Recap' ? ', including the return impact: IRR, multiple, profit, cash returned,' : ', including every test, the loan, debt service and proceeds,') + ' and the rendered sheet' + (kind === 'Refinancing Analysis' ? ' and the report' : '') + ' exactly)', bad2.length === 0, bad2.slice(0, 3).join(' | ')); }
  /* what each scenario is meant to show, read from the results rather than the record */
  const K = (set, n) => unser(set[n].key); const exp = []; { const errs = [...oldR ? Object.entries(oldR) : [], ...Object.entries(newR)].filter(([, v]) => /^ERR/.test(v.engine)).map(([k]) => k); check('no designed scenario throws in either tool', errs.length === 0, errs.join()); }
  OLD.forEach(sc => { const k = K(oldR, sc.n), e = sc.e; if (e.bind) { const cap = (k && k.caps) || [], low = Math.min(...cap), first = ['LTV', 'DSCR', 'Debt yield'][cap.findIndex(c => c === low)]; exp.push([sc.n, cap.length === 3 && k.binding === e.bind && k.binding === first && k.loan === low && (!e.distinct || new Set(cap).size === 3)]); }
    if (e.noSelected) exp.push([sc.n, k !== null && k.valid === false && k.loan === null]); if (e.none) exp.push([sc.n, k === null]); });
  const oldBad = exp.filter(x => !x[1]).map(x => x[0]); check('Refi / Recap: each test binds when it should (LTV, DSCR, debt yield), three different limits give three different capacities and the lowest wins, an invalid year or no debt or a development gives no refinance', oldBad.length === 0, oldBad.join());
  const nexp = []; NEW.forEach(sc => { const k = K(newR, sc.n), e = sc.e; if (e.bind) { const T = k.tests || [], low = Math.min(...T.map(t => t[1])), hit = T.find(t => t[1] === low), first = hit && hit[0]; nexp.push([sc.n, !!k.ok && T.length > 0 && k.binding === e.bind && k.binding === first && k.raw === low && k.loan === Math.max(0, Math.floor(low / 1000) * 1000) && (!e.distinct || new Set(T.map(t => t[1])).size === 3) && (!e.tests || T.length === e.tests)]); }
    if (e.tie) nexp.push([sc.n + ' (tie)', e.tie.every(nm => (k.tests || []).some(t => t[0] === nm && t[1] === k.raw)) && k.binding === e.tie[0]]);
    if (e.notOk) nexp.push([sc.n, k.ok === false && k.loan == null && k.missing.some(m => m.includes(e.missing))]); if (e.noMain) nexp.push([sc.n, k.ok === false && k.loan == null && k.missing.some(m => m.includes('Existing loan balance'))]);
    if (e.alts) nexp.push([sc.n, e.alts.every(nm => k.alts.some(a => a[1] === nm))]); });
  const newBad = nexp.filter(x => !x[1]).map(x => x[0]); check('Refinancing Analysis: each test (LTV, DSCR, debt yield, the amount requested) binds when it should, the loan is the lowest rounded down to $1,000, ties go to the first test, an alternative for each test binds, and a missing or invalid input gives no loan and names what is missing', newBad.length === 0, newBad.join());
  { const k = K(newR, 'interest-only-2-years'), d = K(newR, 'default'); check('an interest-only period does not change the sizing (lenders size on the amortizing payment) but year-1 debt service is interest only', k.loan === d.loan && Math.abs(k.ds1 - k.loan * 0.065) < 1e-6, [k.loan, d.loan, k.ds1].join()); }
  { const k = K(newR, 'interest-only-whole-term'), dscr = ((k.tests || []).find(t => t[0] === 'Debt service coverage') || [])[1]; check('with no amortization the debt-service test is sized on interest alone: NOI / 1.25 / 6.50%', near(dscr, 677008 / 1.25 / 0.065, 1e-12), dscr); }
  { const k = K(newR, 'amortization-27.3-not-rounded'), dscr = ((k.tests || []).find(t => t[0] === 'Debt service coverage') || [])[1], pv = (n) => 677008 / 1.25 / 12 * (1 - Math.pow(1 + 0.065 / 12, -n)) / (0.065 / 12); check('the Refinancing Analysis takes the amortization as entered (327.6 months), Refi / Recap in whole months, as each always has', near(dscr, pv(327.6), 1e-12) && !near(dscr, pv(328), 1e-12), dscr); }
  { const k = K(newR, 'requested-only'); check('a requested amount with no lender limits is sized on that alone', !!k.ok && (k.tests || []).length === 1 && k.loan === 5000000, JSON.stringify(k.tests)); }

  /* (3) both tools go through the shared rule */
  const spy = await p.evaluate(([a, d]) => { const orig = window.bkSizeLoan, calls = []; window.bkSizeLoan = function(c){ calls.push({ roundMonths: c.roundMonths, debtConstant: c.debtConstant, tests: (c.tests || ['ltv', 'dscr', 'dy']).join() }); return orig.apply(this, arguments); };
    bkCreateNewDeal(a[0]); let s = bkLoad(); Object.assign(s, a[0], a[1]); bkSave(s); calls.length = 0; bkRefi(); const old = calls.slice(); bkCreateNewDeal(d); s = bkLoad(); Object.assign(s, d); bkSave(s); calls.length = 0; bkRefinance(); const nu = calls.slice(); window.bkSizeLoan = orig; return { old, nu }; }, [[A, ACQ], D]);
  check('Refi / Recap sizes through the shared rule (one call for each refinance year it shows), all three tests, whole-month amortization', spy.old.length >= 3 && spy.old.every(c => c.roundMonths === true && c.debtConstant === undefined && c.tests === 'ltv,dscr,dy'), JSON.stringify(spy.old.slice(0, 2)));
  check('the Refinancing Analysis sizes through the shared rule (the proposed loan and each alternative), with its own debt service per $1', spy.nu.length === 3 && spy.nu.every(c => typeof c.debtConstant === 'number'), JSON.stringify(spy.nu));
  { const src = (f) => fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8'), a = src('131-bk-v29150-refi.js'), b = src('183a-bk-refinance.js');
    check('neither tool still carries its own copy of the sizing: no present-value capacity, no lowest-of-three, no loan / DSCR / debt-constant division, no reduce to the lowest test', !/function pvAnn|annual \/ 12 \* \(1 - Math\.pow/.test(a) && !/Math\.min\(cLTV, cDSCR, cDY\)/.test(a) && !/noi \/ out\.minDSCR \/ amortF/.test(b) && !/out\.tests\.reduce/.test(b) && !/value \* out\.maxLTV/.test(b)); }
  check('no page errors', p.errs.length === 0, p.errs.join(' | ')); console.log(checks + ' checks, ' + fails + ' failures'); await p.b.close(); process.exit(fails ? 1 : 0);
})();
