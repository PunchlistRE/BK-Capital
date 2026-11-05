// Funding scenario suite: Sources & Uses, the funding ledger, contributed equity, the waterfall and the returns are checked across many configurations of the
// development deals (Harbor Point and the audit development deal) and the acquisition deal, not only on the three base cases.
//
// Every scenario is evaluated in the page with window.bkRunWith (no saved state is touched) and then checked from the engines' raw monthly output with this
// file's own arithmetic: sums over the months, a month-by-month interest and balance roll-forward, an independent permanent-loan sizing, an independent XIRR,
// the waterfall's contributions and distributions. The shared funding calculation (bkFundingSummary, src/184) and the integrity layer (src/178) are then required to
// agree with those independent figures. A scenario passes only if every check passes.
//
//   node audit/funding_scenarios_test.js index.html            run the suite (exit 1 on any failure)
//   node audit/funding_scenarios_test.js index.html --json out.json     also write one headline record per scenario (used for before / after comparisons)
//   node audit/funding_scenarios_test.js index.html --only "ceiling"    run only the scenarios whose name contains the text
//
// The four capital measures (audit/CAPITAL_MEASURES.md) are re-derived here in every scenario from the months and the returns rows and compared with the funding summary:
// closing equity, total contributed equity (and the capital called after closing it is made of), the operating cash requirement (what the funding schedule carries, what is
// needed after closing, who funds it) and total project capitalization. They are never expected to equal one another; they are expected to reconcile.
//
// Scenario groups: construction sizing (LTC, LTSV, rate, fees, utilisation), schedule (construction, lease-up, pre-development), facility structure (ceiling above or at
// the commitment, fixed amount, equity-first, unused-commitment fee, no loan), initial reserves (interest, operating, held; smaller and larger than the need; funded at
// close, completion or a month), takeout (none, shortfall, cash-out, debt-yield bound, interest-only), budget modes, GP share and waterfall terms, a hold sweep of 1 to
// 10 years (a hold that ends before the building is complete is an INVALID configuration and must be reported as a failed check, never as a result), the
// acquisition financing modes (LTV, LTC, DSCR, rate, IO, amortisation, fees, rate cap, no debt, refinance at maturity, balloon) and combinations.
// Scenarios tagged [regression A|B|C] are the ones that failed before the funding reconciliation: A interest reserve, B facility / ceiling, C hold period.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); const path = require('path'); const fs = require('fs');
const H = require(path.join(__dirname, 'harbor', 'deal.js')), V = require(path.join(__dirname, 'devdeal.js')), A = require(path.join(__dirname, 'deal.js'));
const argv = process.argv.slice(2), flag = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const FILE = path.resolve(argv.find((a) => /\.html$/.test(a)) || 'index.html'), JSON_OUT = flag('--json'), ONLY = flag('--only');

/* ------------------------------------------------------------------ the probe: runs in the page, returns plain data */
const PROBE = () => {
  const num = (v) => { const n = Number(v); return isFinite(n) ? n : 0; };
  const day = (d) => (d instanceof Date ? d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate() : d == null ? null : String(d));
  const s = bkLoad(), dev = /develop/i.test(String(s.dealType || '')), scalars = {};
  Object.keys(s).forEach((k) => { const v = s[k]; if (v === null || typeof v !== 'object') scalars[k] = v; }); scalars.initReserves = s.initReserves || [];
  const m = bkMonthlyReturns(), F = bkFundingSummary(), I = bkIntegrity(), T = bkAllInputsTie();
  let W = null; try { const w = bkWaterfallSummary(); W = { lpC: num(w.lp.contributed), gpC: num(w.gp.contributed), lpD: num(w.lp.dist), gpD: num(w.gp.dist), ties: !!w.ties }; } catch (e) {}
  const out = { dev, s: scalars, calcNOI: num(bkCalc().noi), acqFeePct: typeof bkAcqFeePct === 'function' ? num(bkAcqFeePct(s)) : num(s.acqFeePct),
    m: { irr: m.irr, moic: m.moic, contrib: m.contrib, dist: m.dist, closeDt: day(m.closeDt) }, W,
    rows: (m.rows || []).map((r) => { const o = {}; Object.keys(r).forEach((k) => { o[k] = r[k] instanceof Date ? day(r[k]) : r[k]; }); return o; }),
    conflicts: (typeof bkConflicts === 'function' ? bkConflicts() : []).map((c) => c.id), hard: I.hard.map((c) => c.id), warn: I.warn.map((c) => c.id), hardDetail: I.hard.map((c) => c.id + ': ' + c.detail), tie: { ok: T.ok, failed: T.failed.map((q) => q.label + ' (' + q.detail + ')') },
    F: { totalUses: F.totalUses, totalSources: F.totalSources, equity: F.equity, engineEquity: F.engineEquity, loan: F.loan, commit: F.commit, ceiling: F.ceiling, principal: F.principal, uses: F.uses, sources: F.sources,
      ties: (F.ties || []).map((q) => [q.id, q.ok, q.a, q.b]), contributed: F.contributed, postClosing: F.postClosing, takeoutEquity: F.takeoutEquity, operatingShortfall: F.operatingShortfall, reserveDraws: F.reserveDraws,
      returnsEquityDraws: F.returnsEquityDraws, gpEquity: F.gpEquity, lpEquity: F.lpEquity, gpPct: F.gpPct, measures: JSON.parse(JSON.stringify(F.measures || null)) }, terms: JSON.parse(JSON.stringify(window.BK_CAPITAL_TERMS || null)) };
  if (dev) {
    const x = bkDevTakeoutV11(); out.months = x.months.map((z) => Object.assign({}, z));
    out.x = { hold: x.hold, stab: x.stab, co: x.co, preMo: x.preMo, eqTarget: x.eqTarget, commit: x.commit, balCap: x.balCap, fixedFacility: !!x.fixedFacility, unlev: x.unlev, upfrontFees: x.upfrontFees, actualCapInt: x.actualCapInt, equityTotal: x.equityTotal, resFunded: x.resFunded, resDrawn: x.resDrawn,
      resRelease: x.resRelease, permLoan: x.permLoan, permFee: x.permFee, conPayoff: x.conPayoff, refiShortfall: x.refiShortfall, refiProceeds: x.refiProceeds, takeoutInHold: x.takeoutInHold, conHeldToSale: !!x.conHeldToSale, conHeldBalance: x.conHeldBalance,
      permDebtAtSale: x.permDebtAtSale, leaseDef: x.leaseDef, noi: x.noi };
  } else { const d = bkDebt(); out.d = { loan: d.loan, equity: d.equity, fee: d.fee, basis: d.basis }; }
  return out;
};

/* ------------------------------------------------------------------ the scenarios */
const IR = (amount, at) => [{ name: 'Interest reserve', amount, at: at || 'close', use: 'interest' }];
const OR = (amount, at) => [{ name: 'Operating reserve', amount, at: at || 'close', use: 'operating' }];
const HR = (amount) => [{ name: 'Held reserve', amount, at: 'close', use: 'held' }];
function devScenarios(hard, base) {
  const S = [], add = (name, ov, o) => S.push(Object.assign({ name, ov }, o || {})), commit = base.x.commit, co = base.x.co;
  add('base', {});
  [0.40, 0.55, 0.75, 0.85].forEach((v) => add('conLTC ' + v, { conLTC: v }));
  add('conLTV 0.30 (value-bound facility)', { conLTV: 0.3 });
  [0.05, 0.10].forEach((v) => add('conRate ' + v, { conRate: v }));
  [12, 30].forEach((v) => add('constructionMonths ' + v, { constructionMonths: v }));
  [3, 6, 24].forEach((v) => add('leaseupMonths ' + v, { leaseupMonths: v }));
  [0, 12].forEach((v) => add('predevMonths ' + v, { predevMonths: v }));
  [0, 0.02].forEach((v) => add('conOrigFee ' + v, { conOrigFee: v }));
  [0.3, 0.9].forEach((v) => add('conUtil ' + v, { conUtil: v }));
  add('no construction loan (all equity)', { conLTC: 0, conLTV: 0 });
  /* facility structure: the commitment caps principal, the ceiling caps the balance (principal plus capitalized interest) */
  add('conCeiling tight', { conCeiling: hard }, { reg: 'B' });
  add('conCeiling loose', { conCeiling: 1e9 }, { reg: 'B' });
  add('conCeiling at the committed amount (no room to capitalize)', { conCeiling: commit });
  add('conCeiling 5% above the committed amount', { conCeiling: Math.round(commit * 1.05) });
  add('fixed facility', { conFixedAmt: hard * 0.9, conCeiling: hard * 1.2 }, { reg: 'B' });
  add('fixed facility, no ceiling', { conFixedAmt: hard * 0.9 });
  add('equity first 10M + unused fee', { conEquityFirst: 10000000, conUnusedFeePct: 0.005 });
  add('unused-commitment fee only', { conUnusedFeePct: 0.005 });
  add('fixed facility + equity first + unused fee', { conFixedAmt: hard * 0.9, conEquityFirst: 8000000, conUnusedFeePct: 0.005 });
  /* initial reserves */
  add('initial reserves 1M funded at close (interest)', { initReserves: IR(1e6) }, { reg: 'A' });
  add('no initial reserves', { initReserves: [] });
  add('interest reserve 250k (smaller than the interest: used up)', { initReserves: IR(250000) });
  add('interest reserve 5M (larger than the interest: the rest is released at sale)', { initReserves: IR(5e6) });
  add('interest reserve 1M + ceiling at the committed amount', { initReserves: IR(1e6), conCeiling: commit });
  add('interest reserve 1M funded at completion', { initReserves: IR(1e6, 'co') });
  add('interest reserve 1M funded in month 12', { initReserves: IR(1e6, 12) });
  add('operating reserve 1M at close', { initReserves: OR(1e6) });
  add('operating reserve 200k with 30% vacancy (lease-up deficit funded, reserve drawn)', { vacancy: 0.3, initReserves: OR(200000) });
  add('lease-up 3 months + operating reserve 50k', { leaseupMonths: 3, initReserves: OR(50000) });
  add('held reserve 500k', { initReserves: HR(500000) });
  add('interest + operating + held reserves', { initReserves: [].concat(IR(750000), OR(400000), HR(300000)) });
  /* takeout */
  add('refinance at stabilization off (construction loan held to sale)', { refiAtStab: 0 });
  add('refinance at stabilization on', { refiAtStab: 1 });
  add('takeout sized by LTV 0.20 (large shortfall)', { refiAtStab: 1, permLTV: 0.2 });
  add('takeout sized by LTV 0.90 and DSCR 1.00 (cash-out)', { refiAtStab: 1, permLTV: 0.9, permDSCR: 1.0 });
  add('takeout sized by debt yield 12%', { refiAtStab: 1, permDebtYield: 0.12 });
  add('takeout interest-only 2 years', { refiAtStab: 1, permIO: 2 });
  /* budget modes */
  add('budget PSF', { devBudgetMode: 'PSF', hardPsf: 210, hardContPct: 0.05, softPsf: 40, ffePerUnit: 3000 });
  add('budget lines', { devBudgetMode: 'LINES', budgetLines: [{ cls: 'hard', name: 'Hard', amount: 18000000 }, { cls: 'cont', name: 'Cont', amount: 900000 }, { cls: 'soft', name: 'Soft', amount: 4000000 }, { cls: 'ffe', name: 'FFE', amount: 300000 }] });
  /* partnership and waterfall */
  [0, 0.25, 0.4].forEach((v) => add('gpShare ' + v, { gpShare: v }));
  add('pref 6% and second hurdle 15%', { pref: 0.06, hurdle2: 0.15 });
  add('pref 10%', { pref: 0.10 });
  add('no GP catch-up', { gpCatchup: 0 });
  add('LP-only preferred return', { prefLPOnly: 1 });
  /* combinations */
  add('combo: LTC 0.75 + rate 0.10 + construction 30 + reserves + gp 0.25', { conLTC: 0.75, conRate: 0.10, constructionMonths: 30, initReserves: IR(1e6), gpShare: 0.25 }, { reg: 'A' });
  add('combo: fixed facility + equity first + refi + lease-up 24', { conFixedAmt: hard * 0.9, conCeiling: hard * 1.2, conEquityFirst: 8000000, refiAtStab: 1, leaseupMonths: 24 }, { reg: 'B' });
  add('combo: LTC 0.85 + conUtil 0.9 + rate 0.10 (heavy capitalized interest)', { conLTC: 0.85, conUtil: 0.9, conRate: 0.10 });
  add('combo: interest reserve + ceiling at the commitment + refi + gp 0.2', { initReserves: IR(1e6), conCeiling: commit, refiAtStab: 1, gpShare: 0.2 });
  add('combo: operating + interest reserves + fixed facility + takeout', { initReserves: [].concat(IR(1e6), OR(300000)), conFixedAmt: hard * 0.9, conCeiling: hard * 1.2, refiAtStab: 1 });
  /* hold sweep: a hold that ends at or before completion is an invalid configuration */
  for (let y = 1; y <= 10; y++) add('holdYears ' + y, { holdYears: y }, { reg: y === 3 ? 'C' : undefined, invalid: y * 12 <= co });
  return S;
}
const acqScenarios = () => {
  const S = [], add = (name, ov, o) => S.push(Object.assign({ name, ov }, o || {}));
  add('base', {});
  [0.5, 0.65, 0.80].forEach((v) => add('acqLTV ' + v, { acqLTV: v }));
  [0.04, 0.09].forEach((v) => add('acqRate ' + v, { acqRate: v }));
  add('acqIO 0', { acqIO: 0 }); add('acqIO 3', { acqIO: 3 }); add('acqAmort 20', { acqAmort: 20 });
  add('acqOrigFee 0', { acqOrigFee: 0 }); add('acqOrigFee 0.02', { acqOrigFee: 0.02 }); add('acqLTC 0.6', { acqLTC: 0.6 }); add('acqDSCR 1.6', { acqDSCR: 1.6 });
  add('all cash (no loan sized)', { acqLTV: 0, acqLTC: 0.0001 }); add('debt switched off', { debtEnabled: false }); add('rate cap premium', { rateCapCost: 150000 });
  add('gpShare 0.1', { gpShare: 0.1 }); add('gpShare 0.3', { gpShare: 0.3 }); add('pref 6% and second hurdle 15%', { pref: 0.06, hurdle2: 0.15 }); add('no GP catch-up', { gpCatchup: 0 });
  add('closing costs 4%', { closingCostsPct: 0.04 }); add('acq fee 1%', { acqFeePct: 0.01 });
  add('refinance at maturity (3-year loan)', { refiAtMaturity: 1, debtTerm: 3 }); add('refinance at maturity, low refinance LTV (equity called)', { refiAtMaturity: 1, debtTerm: 3, refiLTV: 0.35 });
  add('3-year loan, balloon, no refinance', { refiAtMaturity: 0, debtTerm: 3 }); add('refinance in year 5 of a 7-year hold', { refiAtMaturity: 1, debtTerm: 5, holdYears: 7 });
  add('combo: LTV 0.8 + rate 0.09 + IO 3 + fee 2% + gp 0.3', { acqLTV: 0.8, acqRate: 0.09, acqIO: 3, acqOrigFee: 0.02, gpShare: 0.3 }, {});
  add('combo: rate cap + refinance + gp 0.25', { rateCapCost: 150000, refiAtMaturity: 1, debtTerm: 3, gpShare: 0.25 });
  for (let y = 1; y <= 10; y++) add('holdYears ' + y, { holdYears: y });
  return S;
};

/* ------------------------------------------------------------------ independent arithmetic */
const num = (v) => { const n = Number(v); return isFinite(n) ? n : 0; };
const near = (a, b, tol) => Math.abs(num(a) - num(b)) <= (tol == null ? 1 : tol);
const money = (v) => Math.round(num(v)).toLocaleString('en-US');
const M = (v) => (v < 0 ? '-$' : '$') + money(Math.abs(v));
const sum = (a, k) => (a || []).reduce((t, z) => t + num(z[k]), 0);
function xirr(vals, dates, closeDay, closeAmt) {   /* the date as written, calendar days / 365, the closing-day component split out as the returns split it; bisection */
  const ymd = (t) => { const p = String(t).split('-').map(Number); return Date.UTC(p[0], p[1] - 1, p[2]) / 86400000; };
  let v = vals.slice(), d = dates.map(ymd);
  if (closeDay && closeAmt) { v = [closeAmt, vals[0] - closeAmt].concat(vals.slice(1)); d = [ymd(closeDay)].concat(d); }
  const t0 = d[0], f = (r) => v.reduce((a, c, i) => a + c / Math.pow(1 + r, (d[i] - t0) / 365), 0); let lo = -0.95, hi = 10;
  if (!(f(lo) * f(hi) < 0)) return NaN;
  for (let i = 0; i < 200; i++) { const mid = (lo + hi) / 2; if (f(lo) * f(mid) <= 0) hi = mid; else lo = mid; }
  return (lo + hi) / 2;
}
/* the permanent loan and the takeout shortfall, sized again from the inputs: forward 12-month NOI -> the lowest of the LTV, DSCR and debt-yield tests, floored to $1,000 -> fee -> against the construction balance at stabilization */
function indepTakeout(P) {
  const s = P.s, x = P.x, ms = P.months, g = num(s.noiGrowth || s.rentGrowth), base = Math.max(0, num(s.stabilizedNOI) || P.calcNOI);
  let fwd = 0; for (let mo = x.stab + 1; mo <= x.stab + 12; mo++) fwd += base * Math.pow(1 + g, Math.max(1, Math.ceil((mo - x.stab + 1) / 12)) - 1) / 12;
  const cap = Math.max(0.0001, num(s.exitCap) || 0.06), byLTV = fwd / cap * num(s.permLTV), r = num(s.permRate) / 12, n = Math.max(1, Math.round((num(s.permAmort) || 30) * 12));
  const ann = num(s.permDSCR) > 0 ? fwd / num(s.permDSCR) / 12 : Infinity, byDSCR = r > 0 ? ann * (1 - Math.pow(1 + r, -n)) / r : ann * n, byDY = num(s.permDebtYield) > 0 ? fwd / num(s.permDebtYield) : Infinity;
  const loan = Math.max(0, Math.floor(Math.max(0, Math.min(byLTV, byDSCR, byDY)) / 1000) * 1000), fee = loan * num(s.permOrigFee);
  const payoff = (ms.find((z) => z.mo === x.stab) || ms[ms.length - 1] || { end: 0 }).end;
  return { fwd, loan, fee, payoff, shortfall: Math.max(0, payoff + fee - loan) };
}

/* ------------------------------------------------------------------ the checks */
function commonChecks(P, chk, sc) {
  const rows = P.rows, F = P.F, s = P.s, m = P.m;
  const contribRow = (r) => (r.wfContrib != null ? num(r.wfContrib) : Math.max(0, -num(r.cf))), distRow = (r) => (r.wfDist != null ? num(r.wfDist) : Math.max(0, num(r.cf)));
  const con = rows.reduce((t, r) => t + contribRow(r), 0), dist = rows.reduce((t, r) => t + distRow(r), 0);
  chk('returns_totals', near(con, m.contrib, 1) && near(dist, m.dist, 1), 'rows: contributions ' + M(con) + ', distributions ' + M(dist) + ' vs returns ' + M(m.contrib) + ' / ' + M(m.dist));
  if (P.W) {
    chk('waterfall_contrib', near(P.W.lpC + P.W.gpC, m.contrib, 1), 'LP ' + M(P.W.lpC) + ' + GP ' + M(P.W.gpC) + ' vs returns ' + M(m.contrib));
    chk('waterfall_dist', near(P.W.lpD + P.W.gpD, m.dist, 1), 'LP ' + M(P.W.lpD) + ' + GP ' + M(P.W.gpD) + ' vs returns ' + M(m.dist));
    chk('waterfall_ties', P.W.ties, 'the waterfall\'s categories add to each partner\'s distributions');
    if (num(s.gpShare) > 0 && P.W.lpC + P.W.gpC > 0) chk('gp_share', Math.abs(P.W.gpC / (P.W.lpC + P.W.gpC) - num(s.gpShare)) < 0.0005, 'GP ' + (100 * P.W.gpC / (P.W.lpC + P.W.gpC)).toFixed(3) + '% of contributions vs Partnership ' + (100 * num(s.gpShare)).toFixed(3) + '%');
  } else chk('waterfall_contrib', false, 'no waterfall result');
  if (isFinite(m.irr) && m.irr != null) {
    const eq0 = num(rows[0] && rows[0].eqDraw), irr = xirr(rows.map((r) => num(r.cf)), rows.map((r) => r.dt), m.closeDt, -eq0);
    chk('irr_independent', isFinite(irr) && Math.abs(irr - m.irr) <= 1e-6, 'engine ' + (100 * m.irr).toFixed(4) + '% vs independent ' + (100 * irr).toFixed(4) + '%');
    chk('moic', con > 0 && Math.abs(m.moic - dist / con) < 1e-9, 'engine ' + num(m.moic).toFixed(6) + ' vs ' + (con ? (dist / con).toFixed(6) : '-'));
  }
  const ids = F.ties.map((q) => q[0]), failedTies = F.ties.filter((q) => !q[1]).map((q) => q[0]);
  chk('funding_ties', failedTies.length === 0, failedTies.length ? 'failed ties: ' + failedTies.join(', ') : '');
  return { con, dist, ids };
}
/* ------------------------------------------------------------------ the four capital measures (audit/CAPITAL_MEASURES.md)
   Each is re-derived by the caller from the months and the returns rows - never from the summary - and the summary is then required to report it under exactly this name.
   The measures are different questions with different answers; the only relations required between them are the reconciliations below. */
const TERMS = ['Closing equity', 'Total contributed equity', 'Operating cash requirement', 'Total project capitalization'];
function measureChecks(P, chk, K) {
  const Z = P.F.measures, W = P.W, T = P.terms || {};
  if (!Z) { chk('measure_names', false, 'the funding summary reports no measures'); return; }
  const E = Z.closingEquity, C = Z.totalContributedEquity, O = Z.operatingCashRequirement, Q = Z.totalProjectCapitalization, gpW = W && W.lpC + W.gpC > 0 ? W.gpC / (W.lpC + W.gpC) : 0;
  const names = [E.name, C.name, O.name, Q.name], reg = [T.closingEquity, T.totalContributedEquity, T.operatingCashRequirement, T.totalProjectCapitalization].map((t) => t && t.name);
  chk('measure_names', TERMS.every((t, i) => names[i] === t && reg[i] === t), 'summary: ' + names.join(' | ') + '; registry: ' + reg.join(' | '));
  chk('measure_closing', near(E.amount, K.closing, 1) && near(E.month1, K.month1, 1), 'closing equity ' + M(E.amount) + ' vs ' + M(K.closing) + ' (' + K.closingFrom + '); in month 1 ' + M(E.month1) + ' vs ' + M(K.month1));
  chk('measure_contributed', near(C.amount, K.con, 1) && near(C.amount, K.closing + K.calls, 1) && (!W || (near(C.lp, W.lpC, 1) && near(C.gp, W.gpC, 1))),
    'total contributed equity ' + M(C.amount) + ' vs the returns\' contributions ' + M(K.con) + ' and closing equity ' + M(K.closing) + ' + capital called after closing ' + M(K.calls) + (W ? '; LP ' + M(C.lp) + ' / GP ' + M(C.gp) + ' vs the waterfall ' + M(W.lpC) + ' / ' + M(W.gpC) : ''));
  const listed = (Z.calls || []).reduce((t, c) => t + num(c.amount), 0), byKind = (k) => num(((Z.calls || []).filter((c) => c.kind === k)[0] || {}).amount);
  chk('measure_calls', near(Z.callsTotal, K.calls, 1) && near(listed, K.calls, 1) && K.parts.every((q) => near(byKind(q[0]), q[1], 1)) && (Z.calls || []).every((c) => K.parts.some((q) => q[0] === c.kind) && near(num(c.lp) + num(c.gp), c.amount, 0.01) && near(c.gp, c.amount * gpW, 1)),
    'capital called after closing ' + M(Z.callsTotal) + ' (listed ' + M(listed) + ') vs ' + M(K.calls) + ' = ' + K.parts.map((q) => q[0] + ' ' + M(q[1])).join(' + ') + (Z.calls || []).filter((c) => !K.parts.some((q) => q[0] === c.kind)).map((c) => '; unexpected call "' + c.kind + '"').join(''));
  chk('measure_operating', near(O.amount, K.lease + K.need, 1) && near(O.inFunding, K.lease, 1) && near(O.afterFunding, K.need, 1) && near(O.byPartners, K.opCalled, 1) && near(O.byReserve, K.resUsed, 1) && near(O.nettedFromDistributions, K.netted, 1) && near(K.need, K.opCalled + K.resUsed + K.netted, 1) &&
    near(num(O.lp) + num(O.gp), O.byPartners, 0.01) && near(O.gp, O.byPartners * gpW, 1) && near(O.peakCumulative, K.peak, 1) && O.peakCumulative <= O.afterFunding + 0.5,
    'operating cash requirement ' + M(O.amount) + ' = in Sources & Uses ' + M(O.inFunding) + ' (' + M(K.lease) + ') + after closing ' + M(O.afterFunding) + ' (' + M(K.need) + '): partners ' + M(O.byPartners) + ' (' + M(K.opCalled) + '), operating reserve ' + M(O.byReserve) + ' (' + M(K.resUsed) + '), netted against distributions ' + M(O.nettedFromDistributions) + ' (' + M(K.netted) + '); peak cumulative ' + M(O.peakCumulative) + ' (' + M(K.peak) + ')');
  chk('measure_capitalization', near(Q.amount, K.debt + K.reserves + K.con, 1) && near(Q.amount, K.sources + K.calls, 1) && near(Q.debt, K.debt, 1) && near(Q.reserves, K.reserves, 1) && near(Q.closingSources, K.sources, 1) && near(Q.contributedEquity, K.con, 1) && near(Q.laterCalls, K.calls, 1),
    'total project capitalization ' + M(Q.amount) + ' vs debt ' + M(K.debt) + ' + reserves ' + M(K.reserves) + ' + contributed equity ' + M(K.con) + ' = ' + M(K.debt + K.reserves + K.con) + '; closing sources ' + M(K.sources) + ' + calls ' + M(K.calls) + ' = ' + M(K.sources + K.calls));
  /* the closing view and the lifecycle view are different figures and are never forced to agree: they differ by exactly the capital called after closing */
  chk('measure_distinct', near(Q.amount - K.sources, K.calls, 1) && (K.calls < 0.5 || Math.abs(Q.amount - K.sources) > 0.5), 'total project capitalization less the closing sources is ' + M(Q.amount - K.sources) + '; the capital called after closing is ' + M(K.calls));
  const callAt = (k) => (Z.calls || []).filter((c) => c.kind === k)[0], tm = [['closing equity first month', E.from, K.months.eq[0]], ['closing equity last month', E.to, K.months.eq[1]], ['operating requirement first month', O.from, K.months.need[0]], ['operating requirement last month', O.to, K.months.need[1]], ['operating requirement months', O.months, K.months.need[2]]];
  Object.keys(K.months.calls).forEach((k) => { const q = K.months.calls[k], c = callAt(k); if (q[2] > 0 && c) tm.push([k + ' call first month', c.from, q[0]], [k + ' call last month', c.to, q[1]]); });
  chk('measure_timing', tm.every((t) => num(t[1]) === num(t[2])), tm.filter((t) => num(t[1]) !== num(t[2])).map((t) => t[0] + ' ' + t[1] + ' vs ' + t[2]).join('; '));
}
function checkDev(P, sc) {
  const R = [], chk = (id, ok, detail) => R.push({ id, ok: !!ok, detail: detail === undefined ? '' : String(detail) }), x = P.x, ms = P.months, s = P.s, F = P.F, rows = P.rows;
  const draws = sum(ms, 'loanDraw'), capInt = sum(ms, 'capInt'), excess = sum(ms, 'excess'), eq = sum(ms, 'eq'), over = sum(ms, 'overflow'), resInt = sum(ms, 'resInt'), resLease = sum(ms, 'resLease'), resFund = sum(ms, 'resFund');
  const cost = ms.reduce((t, z) => t + num(z.land) + num(z.hard) + num(z.soft) + num(z.lease), 0), fees = sum(ms, 'fees') + sum(ms, 'unused');
  /* cost side and the monthly identities */
  chk('cost_budget', near(cost, x.unlev, 1), 'months ' + M(cost) + ' vs development cost ' + M(x.unlev));
  chk('fees', near(fees, x.upfrontFees, 1), 'months ' + M(fees) + ' vs ' + M(x.upfrontFees));
  chk('capint_total', near(capInt, x.actualCapInt, 1), 'months ' + M(capInt) + ' vs ' + M(x.actualCapInt));
  const badFund = ms.filter((z) => !near(num(z.need), num(z.eq) + num(z.loanDraw) + num(z.overflow) + num(z.resLease), 0.01));
  chk('monthly_funding', badFund.length === 0, badFund.length ? 'month ' + badFund[0].mo + ': need ' + M(badFund[0].need) + ' is not equity + draw + overflow + operating reserve' : '');
  const commit = num(x.commit), ceiling = Math.max(commit, num(s.conCeiling)), payoffMo = num(s.refiAtStab) ? x.stab : x.hold, rate = num(s.conRate);
  let bal = 0; const badInt = [];
  ms.forEach((z) => { const accr = commit > 0 && z.mo <= x.stab && z.mo < payoffMo, interest = accr ? bal * rate / 12 : 0;
    if (!near(num(z.beg), bal, 0.01) || !near(num(z.capInt) + num(z.excess), interest, 0.01) || num(z.capInt) > Math.max(0, ceiling - bal) + 0.01) badInt.push('month ' + z.mo);
    bal += num(z.capInt) + num(z.loanDraw); if (!near(num(z.end), bal, 0.01)) badInt.push('month ' + z.mo + ' balance'); });
  chk('monthly_interest', badInt.length === 0, badInt.slice(0, 3).join(', ') + (badInt.length ? ': interest is opening balance x rate / 12, capitalized only up to the ceiling, and the balance rolls forward' : ''));
  /* the commitment sized again from the inputs (the closed-form loan to cost that solves the interest-on-interest circularity, or loan to stabilized value, floored to $1,000) and the equity-first rule: equity pays first, up to its target, before any loan draw */
  const rate0 = Math.max(0, num(s.conRate)), feeFac = Math.max(0, num(s.conOrigFee) + num(s.conCapCost) + num(s.guarantyFeePct)), accr = Math.max(3, Math.round((Math.min(num(s.refiAtStab) ? x.stab : x.hold, x.stab) - (x.preMo + 1) + 1) * 0.7)), intFac = Math.max(0, num(s.conUtil)) * rate0 * accr / 12;
  const ltc = num(s.conLTC), ltv = num(s.conLTV), stabVal = num(s.exitCap) > 0 ? P.calcNOI / num(s.exitCap) : 0, cLTC = ltc > 0 && ltc * (feeFac + intFac) < 1 ? ltc * (x.unlev + num(s.lenderLegal)) / (1 - ltc * (feeFac + intFac)) : 0, cLTV = ltv > 0 ? ltv * stabVal : Infinity;
  const rawC = Math.min(ltc > 0 ? (cLTC || 0) : Infinity, cLTV), commitInd = num(s.conFixedAmt) > 0 ? num(s.conFixedAmt) : (isFinite(rawC) ? Math.max(0, Math.floor(rawC / 1000) * 1000) : 0);
  chk('commit_sizing', near(commit, commitInd, 0.5), 'committed amount ' + M(commit) + ' vs sized from the inputs ' + M(commitInd) + (num(s.conFixedAmt) > 0 ? ' (fixed amount)' : ' (loan to cost ' + M(cLTC) + ', loan to value ' + (isFinite(cLTV) ? M(cLTV) : 'none') + ')'));
  const etInd = num(s.conEquityFirst) > 0 ? num(s.conEquityFirst) : (commitInd > 0 ? Math.max(0, x.unlev + commitInd * feeFac + num(s.lenderLegal) + commitInd * intFac - commitInd) : Infinity); let cumEq = 0; const early = [];
  ms.forEach((z) => { cumEq += num(z.eq); if (num(z.loanDraw) > 0.01 && cumEq < etInd - 0.5) early.push('month ' + z.mo); });
  chk('equity_first', (isFinite(etInd) ? near(x.eqTarget, etInd, 0.5) : num(x.eqTarget) > 9e14) && eq <= etInd + 0.5 && early.length === 0, 'equity target ' + (isFinite(etInd) ? M(etInd) : 'none (no loan)') + ' vs engine ' + M(x.eqTarget) + '; equity before the loan ' + M(eq) + (early.length ? '; a loan draw before the target in ' + early.slice(0, 3).join(', ') : ''));
  /* two limits: the committed principal and the permitted balance */
  chk('principal_vs_commit', draws <= commit + 0.5, 'principal drawn ' + M(draws) + ' vs committed amount ' + M(commit));
  const peak = Math.max.apply(null, ms.map((z) => num(z.end)).concat([0]));
  chk('balance_vs_ceiling', peak <= ceiling + 0.5 && near(x.balCap, ceiling, 0.01), 'peak balance ' + M(peak) + ' vs ceiling ' + M(ceiling) + ' (committed ' + M(commit) + ', engine ceiling ' + M(x.balCap) + ')');
  if (num(s.conFixedAmt) > 0) chk('fixed_amount', near(commit, s.conFixedAmt, 0.01) && draws <= num(s.conFixedAmt) + 0.5, 'commitment ' + M(commit) + ', principal ' + M(draws) + ' vs fixed ' + M(s.conFixedAmt));
  /* reserves: nothing created or lost, nothing drawn before it is funded, a reserve draw never exceeds the need it pays */
  const resIn = (use) => (s.initReserves || []).filter((r) => (use === 'operating' || use === 'interest' ? r.use === use : r.use !== 'operating' && r.use !== 'interest')).reduce((t, r) => t + num(r.amount), 0);
  chk('reserve_conservation', near(resFund, resLease + resInt + num(x.resRelease), 0.5) && resInt <= resIn('interest') + 0.5 && resLease <= resIn('operating') + 0.5 && ms.every((z) => num(z.resInt) <= num(z.excess) + 0.01 && num(z.resLease) <= num(z.lease) + 0.01),
    'funded ' + M(resFund) + ' = drawn for lease-up ' + M(resLease) + ' + drawn for interest ' + M(resInt) + ' + released ' + M(x.resRelease));
  /* sources and uses, built here from the months */
  const usesInd = cost + fees + capInt + excess + resFund, srcInd = draws + capInt + eq + over + (excess - resInt) + resLease + resInt, eqInd = eq + over + excess - resInt;
  chk('su_independent', near(usesInd, srcInd, 0.5), 'uses ' + M(usesInd) + ' vs sources ' + M(srcInd));
  chk('su_summary', near(F.totalUses, usesInd, 1) && near(F.totalSources, srcInd, 1) && near(F.totalUses, F.totalSources, 1), 'Sources & Uses page: uses ' + M(F.totalUses) + ', sources ' + M(F.totalSources) + ' vs independent ' + M(usesInd) + ' / ' + M(srcInd));
  const grp = (re) => F.sources.filter((q) => re.test(q[0])).reduce((t, q) => t + num(q[1]), 0);
  chk('su_lines', near(grp(/^Construction Facility/), draws + capInt, 1) && near(grp(/^Equity/), eqInd, 1) && near(grp(/^Initial reserves/), resLease + resInt, 1),
    'facility lines ' + M(grp(/^Construction Facility/)) + ' (' + M(draws + capInt) + '), equity lines ' + M(grp(/^Equity/)) + ' (' + M(eqInd) + '), reserve lines ' + M(grp(/^Initial reserves/)) + ' (' + M(resLease + resInt) + ')');
  /* equity four ways */
  const retEq = sum(rows, 'equityDraw');
  chk('equity_components', near(F.equity, eqInd, 1) && near(x.equityTotal, eqInd, 1) && near(retEq, eqInd, 1), 'Sources ' + M(F.equity) + ', engine ' + M(x.equityTotal) + ', returns draws ' + M(retEq) + ', months ' + M(eqInd));
  chk('equity_cost_side', near(usesInd - draws - capInt - resLease - resInt, F.equity, 1), 'uses less facility less reserve draws ' + M(usesInd - draws - capInt - resLease - resInt) + ' vs equity ' + M(F.equity));
  /* contributions = equity at funding + takeout equity + lease-up operating shortfall, each from its own engine */
  const takeEq = sum(rows, 'refiEq'), opInd = rows.reduce((t, r) => t + Math.max(0, num(r.wfContrib) - num(r.equityDraw) - num(r.refiEq)), 0), inHold = num(s.refiAtStab) > 0 && x.stab <= x.hold;
  chk('contrib_parts', near(P.m.contrib, F.equity + takeEq + opInd, 1), 'contributed ' + M(P.m.contrib) + ' = equity ' + M(F.equity) + ' + takeout ' + M(takeEq) + ' + operating shortfall ' + M(opInd));
  chk('opshort_rows', near(sum(rows, 'opShort'), opInd, 1) && near(F.operatingShortfall, opInd, 1), 'rows ' + M(sum(rows, 'opShort')) + ', summary ' + M(F.operatingShortfall) + ' vs ' + M(opInd));
  /* the "second capital call" warning is raised only when the takeout is actually called inside the hold */
  chk('takeout_conflict', P.conflicts.indexOf('dev.takeout-shortfall') >= 0 === (inHold && num(x.refiShortfall) > 1), 'shortfall ' + M(x.refiShortfall) + ', takeout inside the hold ' + inHold + ', warning ' + (P.conflicts.indexOf('dev.takeout-shortfall') >= 0 ? 'raised' : 'not raised'));
  /* the input validation: a hold that ends at or before completion is an ERROR conflict (the deal is not decision-grade); a sale between completion and stabilization is not a conflict */
  chk('hold_conflict', (P.conflicts.indexOf('dev.hold-before-completion') >= 0) === (x.hold <= x.co), 'hold ends in month ' + x.hold + ', completion in month ' + x.co + ', conflict ' + (P.conflicts.indexOf('dev.hold-before-completion') >= 0 ? 'raised' : 'not raised'));
  chk('takeout_in_hold', !!x.takeoutInHold === inHold, 'engine says ' + x.takeoutInHold + ', inputs say ' + inHold + ' (stabilization month ' + x.stab + ', hold ' + x.hold + ')');
  if (num(s.refiAtStab) > 0) { const T = indepTakeout(P);
    chk('takeout_independent', near(x.permLoan, T.loan, 0.5) && near(x.refiShortfall, T.shortfall, 1) && near(takeEq, inHold ? T.shortfall : 0, 1),
      'permanent loan ' + M(x.permLoan) + ' (' + M(T.loan) + '), shortfall ' + M(x.refiShortfall) + ' (' + M(T.shortfall) + ' = payoff ' + M(T.payoff) + ' + fee ' + M(T.fee) + ' - loan ' + M(T.loan) + '), called in returns ' + M(takeEq)); }
  else chk('takeout_independent', near(takeEq, 0, 0.5) && near(x.refiShortfall, 0, 0.5), 'no takeout assumed: returns call ' + M(takeEq) + ', shortfall ' + M(x.refiShortfall));
  /* the monthly cash flow rebuilt from its parts; the sale and the debt repaid */
  const badCf = rows.filter((r) => !near(num(r.cf), -num(r.equityDraw) - num(r.refiEq) + num(r.noi) - num(r.assetFee) - num(r.ds) + num(r.refi) + num(r.sale) - num(r.dispoFee) - num(r.payoff) - num(r.leaseCap) + num(r.resOp) + num(r.resRelease), 0.01));
  chk('cf_parts', badCf.length === 0, badCf.length ? 'month ' + badCf[0].m + ': net cash flow is not equity, NOI, fees, debt service, takeout, sale, payoff, leasing capital and reserves' : '');
  const last = rows[rows.length - 1] || {}, expectPay = x.hold < x.stab ? num((ms[x.hold - 1] || {}).end) : (x.conHeldToSale ? num(x.conHeldBalance) : num(x.permDebtAtSale));
  chk('sale_payoff', near(last.sale, num(last.grossSale) * (1 - num(s.saleCostPct)), 2) && near(last.payoff, expectPay, 1), 'sale ' + M(last.sale) + ' vs ' + M(num(last.grossSale) * (1 - num(s.saleCostPct))) + '; debt repaid ' + M(last.payoff) + ' vs outstanding ' + M(expectPay));
  const c = commonChecks(P, chk, sc);
  ['su', 'commit', 'ceiling', 'eqEngine', 'eqReturns', 'takeout', 'contrib', 'capContrib', 'capTotal', 'capOperating'].forEach((id) => { if (c.ids.indexOf(id) < 0) chk('tie_present_' + id, false, 'the funding summary has no "' + id + '" tie'); });
  /* the four capital measures. The operating cash requirement outside the funding schedule is rebuilt month by month from the components of the monthly cash (NOI, fees, debt service, takeout, sale, payoff, leasing capital), before the reserve and before any call;
     a month's cash after the reserve is wfDist - opShort. The requirement must equal what the partners call + the operating reserve's net use + any reserve draw repaid out of a month with surplus cash. */
  const opm = (r) => num(r.noi) - num(r.assetFee) - num(r.ds) + num(r.refi) + num(r.sale) - num(r.dispoFee) - num(r.payoff) - num(r.leaseCap);
  let cumOp = 0, peakOp = 0, needOp = 0, nettedOp = 0;
  rows.forEach((r) => { const o = opm(r); needOp += Math.max(0, -o); cumOp -= o; if (cumOp > peakOp) peakOp = cumOp; if (num(r.wfDist) - num(r.opShort) >= 0 && num(r.resOp) < 0) nettedOp -= num(r.resOp); });
  const mo = (f) => { const q = rows.filter(f); return [q.length ? q[0].m : 0, q.length ? q[q.length - 1].m : 0, q.length]; };
  measureChecks(P, chk, { closing: eqInd, closingFrom: 'the funding months', month1: num(rows[0] && rows[0].equityDraw), con: c.con, calls: takeEq + opInd, parts: [['takeout', takeEq], ['operating', opInd]], lease: sum(ms, 'lease'), need: needOp, netted: nettedOp, opCalled: opInd, resUsed: sum(rows, 'resOp'), peak: peakOp,
    debt: draws + capInt, reserves: resLease + resInt, sources: srcInd, months: { eq: mo((r) => num(r.equityDraw) > 0.5), need: mo((r) => num(r.opShort) + num(r.resOp) > 0.5), calls: { takeout: mo((r) => num(r.refiEq) > 0.5), operating: mo((r) => num(r.opShort) > 0.5) } } });
  /* the verdicts: a valid configuration is clean; an invalid one (the hold ends before the building is complete) must be reported as a failed check */
  if (sc.invalid) { chk('invalid_reported_hard', P.hard.indexOf('hold_co') >= 0 && !P.tie.ok, 'hard checks: ' + (P.hard.join(', ') || 'none') + '; ALL INPUTS TIE ' + (P.tie.ok ? 'reads OK' : 'fails')); }
  else { chk('integrity_clean', P.hard.length === 0, P.hardDetail.join(' | ')); chk('all_inputs_tie', P.tie.ok, P.tie.failed.join(' | ')); }
  /* the disclosures that must stand */
  if (x.hold < x.stab && x.hold > x.co) chk('sale_before_stabilization_disclosed', P.warn.indexOf('w_sale') >= 0, 'a sale before stabilization is a valid case that must be disclosed');
  if (excess > 1) chk('interest_beyond_limit_disclosed', P.warn.indexOf('w_interest') >= 0, M(excess) + ' of interest accrues beyond the facility limit');
  return { R, facts: { netted: nettedOp, excess, resInt, resLease, resFund, takeEq, opInd, shortfall: num(x.refiShortfall), inHold, leaseDef: num(x.leaseDef), ceilingAboveCommit: ceiling > commit + 1, peakOverCommit: peak > commit + 1, fixed: num(s.conFixedAmt) > 0, noLoan: commit <= 0, saleBeforeStab: x.hold < x.stab && x.hold > x.co, proceeds: num(x.refiProceeds) } };
}
function checkAcq(P, sc) {
  const R = [], chk = (id, ok, detail) => R.push({ id, ok: !!ok, detail: detail === undefined ? '' : String(detail) }), s = P.s, d = P.d, F = P.F, rows = P.rows;
  const price = num(s.purchasePrice), closing = price * num(s.closingCostsPct), acqFee = price * P.acqFeePct, cap = num(s.rateCapCost), debtOff = s.debtEnabled === false;
  const uses = price + closing + acqFee + num(d.fee) + cap, eqClose = num(d.equity) + cap;
  chk('loan_fee', near(d.fee, debtOff ? 0 : num(d.loan) * num(s.acqOrigFee), 1), 'fee ' + M(d.fee) + ' vs loan ' + M(d.loan) + ' x ' + num(s.acqOrigFee));
  chk('su_independent', near(uses, num(d.loan) + eqClose, 1), 'uses ' + M(uses) + ' (price + closing + acquisition fee + loan fee + rate cap) vs loan ' + M(d.loan) + ' + equity ' + M(eqClose));
  chk('su_summary', near(F.totalUses, uses, 1) && near(F.totalSources, uses, 1) && near(F.loan, d.loan, 1) && near(F.equity, eqClose, 1), 'summary uses ' + M(F.totalUses) + ', sources ' + M(F.totalSources) + ', loan ' + M(F.loan) + ', equity ' + M(F.equity) + ' vs independent ' + M(uses));
  chk('equity_month1', near(num(rows[0] && rows[0].eqDraw), eqClose, 1), 'month-1 equity in the returns ' + M(rows[0] && rows[0].eqDraw) + ' vs equity at closing ' + M(eqClose));
  chk('post_closing', near(F.postClosing, P.m.contrib - eqClose, 1) && near(F.contributed, P.m.contrib, 1), 'capital after closing ' + M(F.postClosing) + ' vs contributed ' + M(P.m.contrib) + ' less equity at closing ' + M(eqClose));
  const last = rows[rows.length - 1] || {};
  chk('sale_costs', near(last.sale + num(last.dispoFee), num(last.grossSale || 0) ? num(last.grossSale) * (1 - num(s.saleCostPct)) : last.sale + num(last.dispoFee), 5) || last.grossSale == null, 'net sale ' + M(last.sale));
  const c = commonChecks(P, chk, sc);
  ['su', 'loan', 'capContrib', 'capTotal'].forEach((id) => { if (c.ids.indexOf(id) < 0) chk('tie_present_' + id, false, 'the funding summary has no "' + id + '" tie'); });
  /* the capital called after closing is each month's contribution above the closing draw. The convention attributes it to the refinance shortfall and the balloon equity of that month first (pro rata between them);
     what is left is the operating cash requirement (operating and capital shortfalls). Acquisitions carry nothing in Sources & Uses beyond the closing view and have no operating reserve. */
  let cRefi = 0, cBal = 0, cOp = 0; const mRefi = [], mBal = [], mOp = [];
  rows.forEach((q) => { const call = Math.max(0, num(q.wfContrib) - num(q.eqDraw)); if (call <= 0.005) return; const ev = num(q.refiEq) + num(q.balloonEq), evCall = Math.min(call, ev), opCall = call - evCall;
    if (ev > 0) { cRefi += evCall * num(q.refiEq) / ev; cBal += evCall * num(q.balloonEq) / ev; if (num(q.refiEq) > 0) mRefi.push(q.m); if (num(q.balloonEq) > 0) mBal.push(q.m); }
    if (opCall > 0.005) { cOp += opCall; mOp.push(q.m); } });
  const mm = (a) => [a[0] || 0, a[a.length - 1] || 0, a.length];
  measureChecks(P, chk, { closing: eqClose, closingFrom: 'price, closing costs, fees and the rate cap, less the loan', month1: num(rows[0] && rows[0].eqDraw), con: c.con, calls: cRefi + cBal + cOp, parts: [['refinance', cRefi], ['balloon', cBal], ['operating', cOp]], lease: 0, need: cOp, netted: 0, opCalled: cOp, resUsed: 0, peak: 0,
    debt: num(d.loan), reserves: 0, sources: uses, months: { eq: [1, 1, 1], need: mm(mOp), calls: { refinance: mm(mRefi), balloon: mm(mBal), operating: mm(mOp) } } });
  chk('integrity_clean', P.hard.length === 0, P.hardDetail.join(' | ')); chk('all_inputs_tie', P.tie.ok, P.tie.failed.join(' | '));
  return { R, facts: { debtOff, cap: cap > 0, refi: num(s.refiAtMaturity) > 0, postClosing: num(F.postClosing), refiCall: cRefi > 1, balloonCall: cBal > 1, opCall: cOp > 1 } };
}

/* ------------------------------------------------------------------ page-level checks: the pages and the investor PDF show what the summary says */
async function pageChecks(p, tag, deal, sc) {
  const R = [], chk = (id, ok, detail) => R.push({ id, ok: !!ok, detail: detail === undefined ? '' : String(detail) });
  const setState = (ov) => p.evaluate(([d, ov]) => { bkCreateNewDeal(d); const s = bkLoad(); Object.assign(s, d, ov); bkSave(s); }, [deal, ov]);
  const rendered = async () => { try { await p.waitForFunction(() => /TOTAL USES/.test(document.getElementById('viewport').innerText), null, { timeout: 8000 }); } catch (e) {} await p.waitForTimeout(150); };
  try {
    await setState(sc.ov);
    const P = await p.evaluate(() => window.__fsProbe()), F = P.F;   /* the saved deal, which is what the pages read */
    await p.evaluate(() => showSheet('Sources & Uses')); await rendered();
    const su = await p.evaluate(() => document.getElementById('viewport').innerText), has = (t) => su.indexOf(t) > -1;
    /* the tables of the page by caption, as cell text: the four measures must be on the page with the amounts the summary reports, each reconciled (TIES) and the closing totals kept apart from the total capitalization */
    const tables = await p.evaluate(() => { const o = {}; document.querySelectorAll('#viewport table').forEach((t) => { const cap = ((t.querySelector('caption') || {}).innerText || '').replace(/\s+/g, ' ').trim(); o[cap] = [...t.querySelectorAll('tr')].map((tr) => [...tr.children].map((c) => c.innerText.replace(/\s+/g, ' ').trim())); }); return o; });
    const tab = (prefix) => { const k = Object.keys(tables).filter((c) => c.indexOf(prefix) === 0)[0]; return k ? tables[k] : null; }, rowOf = (t, label) => (t || []).filter((r) => r[0] === label)[0];
    const amt = (t) => { const m = String(t).replace(/\s+/g, '').match(/^(\()?-?\$?([\d,]+(?:\.\d+)?)\)?$/); return m ? (/^\(|^-/.test(String(t).trim()) ? -1 : 1) * Number(m[2].replace(/,/g, '')) : NaN; };
    const measurePage = () => {
      const Z = F.measures, NM = [Z.closingEquity, Z.totalContributedEquity, Z.operatingCashRequirement, Z.totalProjectCapitalization], t1 = tab('Capital Measures'), t2 = tab('Capitalization Over the Life of the Deal'), r1 = NM.map((z) => rowOf(t1, z.name));
      chk('page_measures', !!t1 && r1.every((r, i) => !!r && near(amt(r[1]), NM[i].amount, 1)), 'Capital Measures table: ' + NM.map((z, i) => z.name + ' ' + (r1[i] ? r1[i][1] : 'missing') + ' (summary ' + M(z.amount) + ')').join('; '));
      chk('page_measures_status', !!t1 && r1.every((r, i) => !!r && (i === 2 && !P.dev ? true : /^TIES$/.test(r[r.length - 1]))), 'reconciliation status of the four measures: ' + r1.map((r) => (r ? r[r.length - 1] || '(none)' : 'missing')).join(', '));
      const calls = Z.calls || [], life = [[P.dev ? 'Construction facility (draws + capitalized interest)' : 'Acquisition loan', F.loan], ['Closing equity', Z.closingEquity.amount], ['Closing sources (total sources in Sources & Uses)', Z.totalProjectCapitalization.closingSources], ['TOTAL PROJECT CAPITALIZATION', Z.totalProjectCapitalization.amount], ['of which total contributed equity', Z.totalContributedEquity.amount]]
        .concat(calls.length ? [['Capital called after closing', Z.callsTotal]] : []).concat(calls.map((c) => [c.name, c.amount])), badLife = life.filter(([l, v]) => { const r = rowOf(t2, l); return !r || !near(amt(r[1]), v, 1); }).map(([l]) => l);
      const split = [['Closing equity', Z.closingEquity.amount]].concat(calls.map((c) => [c.name, c.amount])).concat([['of which total contributed equity', Z.totalContributedEquity.amount]]), badSplit = split.filter(([l, v]) => { const r = rowOf(t2, l); return !r || !near(amt(r[3]) + amt(r[4]), v, 1.5); }).map(([l]) => l);
      chk('page_capitalization', !!t2 && badLife.length === 0 && (calls.length > 0 || !!rowOf(t2, 'Capital called after closing')) && badSplit.length === 0, !t2 ? 'no "Capitalization Over the Life of the Deal" table' : (badLife.length ? 'not shown with its amount: ' + badLife.join('; ') : '') + (badSplit.length ? ' LP + GP do not add to the amount: ' + badSplit.join('; ') : ''));
      /* the closing total and the total capitalization are two figures on the page and differ by exactly the capital called after closing */
      const cs = rowOf(t2, 'Closing sources (total sources in Sources & Uses)'), tp = rowOf(t2, 'TOTAL PROJECT CAPITALIZATION');
      chk('page_closing_vs_total', !!cs && !!tp && near(amt(tp[1]) - amt(cs[1]), Z.callsTotal, 1.5) && (Z.callsTotal < 0.5 || amt(tp[1]) > amt(cs[1])), 'total project capitalization ' + (tp && tp[1]) + ' less the closing sources ' + (cs && cs[1]) + ' vs the capital called after closing ' + M(Z.callsTotal));
      const O = Z.operatingCashRequirement, t3 = tab('Operating cash requirement');
      if (P.dev && (O.amount > 0.5 || O.leaseUpMonths)) {
        const want = [['Net lease-up deficit funded in Sources & Uses', O.inFunding], ['Interim operating cash required after closing', O.afterFunding], ['Peak cumulative operating cash deficit outside the funding schedule', O.peakCumulative]], bad = want.filter(([l, v]) => { const r = rowOf(t3, l); return !r || !near(amt(r[1]), v, 1); }).map(([l]) => l), fb = rowOf(t3, 'Funded by');
        chk('page_operating', !!t3 && bad.length === 0 && !!fb && (fb[2] || '').indexOf('Partners $' + money(O.byPartners)) > -1 && (O.byReserve < 0.5 || (fb[2] || '').indexOf('Operating reserve $' + money(O.byReserve)) > -1) && (O.nettedFromDistributions < 0.5 || (fb[2] || '').indexOf('Netted against later distributions $' + money(O.nettedFromDistributions)) > -1),
          !t3 ? 'no operating cash requirement table' : (bad.length ? 'not shown with its amount: ' + bad.join('; ') : '') + ' funded by: ' + (fb ? fb[2] : 'missing') + ' (partners ' + money(O.byPartners) + ', reserve ' + money(O.byReserve) + ', netted ' + money(O.nettedFromDistributions) + ')');
      }
    };
    measurePage();
    if (P.dev) {
      chk('page_totals', has(money(F.totalUses)) && has(money(F.totalSources)) && /TOTAL USES/.test(su) && /TOTAL SOURCES/.test(su), 'the page shows total uses ' + money(F.totalUses) + ' and total sources ' + money(F.totalSources));
      const missing = F.uses.concat(F.sources).filter((q) => Math.abs(num(q[1])) > 0.5 && !(has(q[0]) && has(money(q[1])))).map((q) => q[0]);
      chk('page_lines', missing.length === 0, missing.length ? 'not shown with its amount: ' + missing.join('; ') : '');
      chk('page_status', /TIES/.test(su) && !/VARIANCE|OVER COMMITMENT|OVER CEILING|REVIEW/.test(su) && /WITHIN COMMITMENT/.test(su) && /WITHIN CEILING/.test(su), 'chips: ' + ['TIES', 'VARIANCE', 'WITHIN COMMITMENT', 'WITHIN CEILING', 'OVER CEILING', 'REVIEW'].filter(has).join(', '));
      chk('page_post_funding', has(money(F.contributed)) && (num(F.takeoutEquity) < 0.5 || has(money(F.takeoutEquity))) && (num(F.operatingShortfall) < 0.5 || has(money(F.operatingShortfall))), 'the page shows contributed equity ' + money(F.contributed) + ', takeout equity ' + money(F.takeoutEquity) + ', the operating shortfall called ' + money(F.operatingShortfall));
      await p.evaluate(() => showSheet('Debt')); await p.waitForTimeout(600);
      const debt = await p.evaluate(() => document.getElementById('viewport').innerText.replace(/\s+/g, ' ')), x = P.x;
      if (num(x.refiShortfall) > 1 && num(P.s.refiAtStab) > 0) chk('debt_page_takeout', x.takeoutInHold ? /does not fully retire the facility/.test(debt) && !/Not called: the hold ends/.test(debt) : /Not called: the hold ends in month \d+, before stabilization in month \d+/.test(debt), 'Debt page shortfall row for a takeout ' + (x.takeoutInHold ? 'inside' : 'after the end of') + ' the hold');
      chk('debt_page_reconciliation', /Sources = Uses at the project level/.test(debt) && /Principal drawn is within the committed loan amount/.test(debt) && /Peak facility balance \(principal plus capitalized interest\) is within the permitted ceiling/.test(debt) && /WITHIN COMMITMENT/.test(debt) && /WITHIN CEILING/.test(debt) && !/VARIANCE|OVER COMMITMENT|OVER CEILING/.test(debt), 'Debt page reconciliations: ' + ['TIES', 'WITHIN COMMITMENT', 'WITHIN CEILING', 'VARIANCE', 'OVER COMMITMENT', 'OVER CEILING'].filter((t) => debt.indexOf(t) > -1).join(', '));
      await p.evaluate(() => { bkGuideOn(); bkGuideGo('sources'); }); await p.waitForTimeout(600);
      const g = await p.evaluate(() => { const el = document.getElementById('gd-su'); return el ? { t: el.innerText, inputs: el.querySelectorAll('input,select,textarea').length } : null; });
      chk('guide_step', !!g && g.inputs === 0 && g.t.indexOf(money(F.totalUses)) > -1 && g.t.indexOf(money(F.equity)) > -1 && g.t.indexOf(money(F.totalSources)) > -1 && (num(F.reserveDraws) < 0.5 || (g.t.indexOf('Initial reserves drawn') > -1 && g.t.indexOf(money(F.reserveDraws)) > -1)), g && g.t.slice(0, 160));
      const Zg = F.measures;
      chk('guide_measures', !!g && TERMS.every((t) => g.t.indexOf(t) > -1) && g.t.indexOf(money(Zg.totalContributedEquity.amount)) > -1 && g.t.indexOf(money(Zg.totalProjectCapitalization.amount)) > -1 && (Zg.operatingCashRequirement.amount < 0.5 || g.t.indexOf(money(Zg.operatingCashRequirement.amount)) > -1), 'the guide step names the four measures with ' + money(Zg.totalContributedEquity.amount) + ' contributed, ' + money(Zg.operatingCashRequirement.amount) + ' operating cash requirement and ' + money(Zg.totalProjectCapitalization.amount) + ' total capitalization');
      await p.evaluate(() => { bkGuideOff(); });
      const pdfText = await p.evaluate(() => new DOMParser().parseFromString(bkReportHTML(), 'text/html').body.textContent.replace(/\s+/g, ' '));
      /* the PDF writes large amounts in millions ($13.26M) and small ones in full ($426,569): read each as written and compare within the precision it was written to */
      const grab = (re) => { const m = pdfText.match(re); if (!m) return null; const v = Number(m[1].replace(/,/g, '')), sfx = m[2] || ''; return { v: sfx === 'M' ? v * 1e6 : sfx === 'K' ? v * 1e3 : v, tol: sfx === 'M' ? 5000 : sfx === 'K' ? 5 : 1 }; }, agree = (g, want) => !!g && Math.abs(g.v - want) <= g.tol + 0.5;
      chk('pdf_measures', agree(grab(/Closing equity \$([\d.,]+)(M|K)? \(with any overflow/), Zg.closingEquity.amount) && agree(grab(/total contributed equity of \$([\d.,]+)(M|K)?/), Zg.totalContributedEquity.amount) && agree(grab(/Total project capitalization: \$([\d.,]+)(M|K)?/), Zg.totalProjectCapitalization.amount)
        && (Zg.operatingCashRequirement.afterFunding < 0.5 || agree(grab(/operating cash requirement after closing is \$([\d.,]+)(M|K)?/), Zg.operatingCashRequirement.afterFunding)),
        'the investor PDF funding page states closing equity ' + money(Zg.closingEquity.amount) + ', total contributed equity ' + money(Zg.totalContributedEquity.amount) + ', the operating cash requirement after closing ' + money(Zg.operatingCashRequirement.afterFunding) + ' and total project capitalization ' + money(Zg.totalProjectCapitalization.amount));
      const pdf = await p.evaluate(() => { const doc = new DOMParser().parseFromString(bkReportHTML(), 'text/html'), tab = (name) => [...doc.querySelectorAll('table')].filter((t) => { const th = t.querySelector('th'); return th && th.textContent.trim() === name; })[0];
        const rows = (t) => t ? [...t.querySelectorAll('tbody tr')].map((tr) => { const td = [...tr.querySelectorAll('td')]; return [td[0] ? td[0].textContent.trim() : '', td[1] ? td[1].textContent.trim() : '']; }) : null; return { uses: rows(tab('Uses')), sources: rows(tab('Sources')) }; });
      const amt = (t) => Number(String(t).replace(/[^0-9.\-]/g, '')) || 0;
      if (pdf.uses && pdf.sources) {
        const pu = pdf.uses.filter((r) => !/^Total/.test(r[0])), ps = pdf.sources.filter((r) => !/^Total/.test(r[0])), tu = (pdf.uses.filter((r) => /^Total/.test(r[0]))[0] || [0, 0])[1], ts = (pdf.sources.filter((r) => /^Total/.test(r[0]))[0] || [0, 0])[1];
        chk('pdf_totals', near(amt(tu), F.totalUses, 1) && near(amt(ts), F.totalSources, 1), 'investor PDF: total project cost ' + tu + ', total sources ' + ts + ' vs ' + money(F.totalUses) + ' / ' + money(F.totalSources));
        chk('pdf_lines_add', near(pu.reduce((t, r) => t + amt(r[1]), 0), amt(tu), 1) && near(ps.reduce((t, r) => t + amt(r[1]), 0), amt(ts), 1), 'investor PDF: the listed uses add to ' + money(pu.reduce((t, r) => t + amt(r[1]), 0)) + ' (total ' + tu + '), the sources to ' + money(ps.reduce((t, r) => t + amt(r[1]), 0)) + ' (total ' + ts + ')');
        const pe = ps.filter((r) => /^Closing equity$/.test(r[0]))[0], pr = ps.filter((r) => /^Initial reserves drawn/.test(r[0]))[0];
        chk('pdf_equity_reserves', pe && near(amt(pe[1]), F.equity, 1) && near(pr ? amt(pr[1]) : 0, F.reserveDraws, 1), 'investor PDF equity ' + (pe && pe[1]) + ' vs ' + money(F.equity) + '; reserves drawn ' + (pr ? pr[1] : 'none') + ' vs ' + money(F.reserveDraws));
      } else chk('pdf_tables', false, 'the investor PDF has no Uses / Sources tables');
    } else {
      /* the acquisition page lays out its own lines (LP / GP equity) and, when capital is called after closing, adds it as an explicit use and source */
      chk('page_totals', has(money(F.totalUses)) && has(money(F.totalSources)) && /TOTAL USES AT CLOSING/.test(su) && /TOTAL SOURCES AT CLOSING/.test(su), 'the page shows the closing totals: total uses at closing ' + money(F.totalUses) + ' and total sources at closing ' + money(F.totalSources) + ' (capital called after closing is a separate row: ' + money(F.measures.callsTotal) + ')');
      const rc = rowOf(tab('Sources at closing'), 'Acquisition Loan');
      chk('page_closing_lines', !!rc && near(amt(rc[1]), F.loan, 1) && has(money(F.measures.closingEquity.amount)), 'closing equity ' + money(F.measures.closingEquity.amount) + ' and the loan ' + money(F.loan) + ' are the closing sources');
      const pdfA = await p.evaluate(() => new DOMParser().parseFromString(bkReportHTML(), 'text/html').body.textContent.replace(/\s+/g, ' '));
      chk('pdf_measures', /Closing equity/.test(pdfA) && pdfA.indexOf(money(F.measures.closingEquity.amount)) > -1 && (num(P.s.rateCapCost) <= 0 || /Rate cap premium/.test(pdfA)) && !/Equity invested/.test(pdfA), 'the investor PDF names the closing equity ' + money(F.measures.closingEquity.amount) + (num(P.s.rateCapCost) > 0 ? ' with the rate cap premium' : ''));
      chk('page_status', !/VARIANCE|OVER COMMITMENT|REVIEW/.test(su), 'the acquisition Sources & Uses page shows no variance');
    }
  } finally { try { await p.evaluate(() => { bkGuideOff(); }); } catch (e) {} await setState({}); }   /* the next scenario starts from the base deal, never from this one */
  return R;
}

/* ------------------------------------------------------------------ mutations: the checks above must fail when the model is wrong */
const MUTS = [
  { name: 'an interest-reserve draw doubled in the funding months', deal: 'H', ov: { initReserves: IR(1e6) }, want: ['equity_components', 'reserve_conservation'], mut: () => { const o = window.bkDevFundingV10; window.bkDevFundingV10 = function () { const f = o.apply(this, arguments); return Object.assign({}, f, { months: f.months.map((z) => (z.resInt > 0 ? Object.assign({}, z, { resInt: z.resInt * 2 }) : z)) }); }; return () => { window.bkDevFundingV10 = o; }; } },
  { name: '$5,000 of extra equity in the first month of the returns', deal: 'V', ov: {}, want: ['equity_components', 'funding_ties'], mut: () => { const o = window.bkMonthlyReturns; window.bkMonthlyReturns = function () { const m = o.apply(this, arguments); if (!m.rows || !m.rows[0] || m.rows[0].equityDraw === undefined) return m; return Object.assign({}, m, { contrib: m.contrib + 5000, rows: m.rows.map((r, i) => (i ? r : Object.assign({}, r, { equityDraw: r.equityDraw + 5000, wfContrib: r.wfContrib + 5000 }))) }); }; return () => { window.bkMonthlyReturns = o; }; } },
  { name: 'the lease-up operating shortfall left out of the returns rows', deal: 'V', ov: {}, want: ['contrib_parts', 'opshort_rows'], mut: () => { const o = window.bkMonthlyReturns; window.bkMonthlyReturns = function () { const m = o.apply(this, arguments); if (!m.rows || m.rows[0].opShort === undefined) return m; return Object.assign({}, m, { rows: m.rows.map((r) => Object.assign({}, r, { opShort: 0 })) }); }; return () => { window.bkMonthlyReturns = o; }; } },
  { name: 'a takeout shortfall misstated by $10,000', deal: 'V', ov: {}, want: ['takeout_independent'], mut: () => { const o = window.bkDevTakeoutV11; window.bkDevTakeoutV11 = function () { const x = o.apply(this, arguments); return Object.assign({}, x, { refiShortfall: (Number(x.refiShortfall) || 0) + 10000 }); }; return () => { window.bkDevTakeoutV11 = o; }; } },
  { name: 'total contributed equity that leaves out the capital called after closing', deal: 'V', ov: {}, want: ['measure_contributed', 'measure_calls'], mut: () => { const o = window.bkFundingSummary; window.bkFundingSummary = function () { const f = o.apply(this, arguments); if (f.measures) f.measures.totalContributedEquity.amount -= f.measures.callsTotal; return f; }; return () => { window.bkFundingSummary = o; }; } },
  { name: 'closing equity that includes the takeout equity', deal: 'V', ov: {}, want: ['measure_closing'], mut: () => { const o = window.bkFundingSummary; window.bkFundingSummary = function () { const f = o.apply(this, arguments); if (f.measures) f.measures.closingEquity.amount += f.measures.calls.filter((c) => c.kind === 'takeout').reduce((t, c) => t + c.amount, 0); return f; }; return () => { window.bkFundingSummary = o; }; } },
  { name: 'an operating cash requirement that omits the unfunded interim cash called after closing', deal: 'V', ov: {}, want: ['measure_operating'], mut: () => { const o = window.bkFundingSummary; window.bkFundingSummary = function () { const f = o.apply(this, arguments); if (f.measures) { const q = f.measures.operatingCashRequirement; q.amount -= q.afterFunding; q.afterFunding = 0; } return f; }; return () => { window.bkFundingSummary = o; }; } },
  { name: 'a peak cumulative operating deficit replaced by the net lease-up view', deal: 'V', ov: {}, want: ['measure_operating'], mut: () => { const o = window.bkFundingSummary; window.bkFundingSummary = function () { const f = o.apply(this, arguments); if (f.measures) f.measures.operatingCashRequirement.peakCumulative = Math.max(0, -f.measures.operatingCashRequirement.leaseUpNet); return f; }; return () => { window.bkFundingSummary = o; }; } },
  { name: 'an operating-reserve repayment netted against distributions that the requirement leaves out', deal: 'V', ov: { leaseupMonths: 3, initReserves: OR(50000) }, want: ['measure_operating'], mut: () => { const o = window.bkFundingSummary; window.bkFundingSummary = function () { const f = o.apply(this, arguments); if (f.measures) { const q = f.measures.operatingCashRequirement; q.afterFunding -= q.nettedFromDistributions; q.amount -= q.nettedFromDistributions; q.nettedFromDistributions = 0; } return f; }; return () => { window.bkFundingSummary = o; }; } },
  { name: 'a total project capitalization that leaves out the reserves drawn', deal: 'H', ov: { initReserves: IR(1e6) }, want: ['measure_capitalization', 'measure_distinct'], mut: () => { const o = window.bkFundingSummary; window.bkFundingSummary = function () { const f = o.apply(this, arguments); if (f.measures) f.measures.totalProjectCapitalization.amount -= f.measures.totalProjectCapitalization.reserves; return f; }; return () => { window.bkFundingSummary = o; }; } },
  { name: 'a measure renamed on the way out', deal: 'V', ov: {}, want: ['measure_names'], mut: () => { const o = window.bkFundingSummary; window.bkFundingSummary = function () { const f = o.apply(this, arguments); if (f.measures) f.measures.closingEquity.name = 'Equity required'; return f; }; return () => { window.bkFundingSummary = o; }; } },
  { name: 'an acquisition refinance shortfall dropped from the capital called after closing', deal: 'A', ov: { refiAtMaturity: 1, debtTerm: 3, refiLTV: 0.35 }, want: ['measure_calls', 'measure_capitalization'], mut: () => { const o = window.bkFundingSummary; window.bkFundingSummary = function () { const f = o.apply(this, arguments); if (f.measures) { const g = f.measures.calls.filter((c) => c.kind === 'refinance').reduce((t, c) => t + c.amount, 0); f.measures.calls = f.measures.calls.filter((c) => c.kind !== 'refinance'); f.measures.callsTotal -= g; } return f; }; return () => { window.bkFundingSummary = o; }; } },
  { name: 'a committed amount that is not what the inputs size', deal: 'H', ov: {}, want: ['commit_sizing'], mut: () => { const o = window.bkDevFundingV10; window.bkDevFundingV10 = function () { const f = o.apply(this, arguments); return Object.assign({}, f, { commit: f.commit + 1000 }); }; return () => { window.bkDevFundingV10 = o; }; } },
  { name: 'capitalized interest pushed $500,000 past the permitted ceiling', deal: 'H', ov: {}, want: ['balance_vs_ceiling', 'monthly_interest'], mut: () => { const o = window.bkDevFundingV10; window.bkDevFundingV10 = function () { const f = o.apply(this, arguments); return Object.assign({}, f, { months: f.months.map((z) => (z.mo === 20 ? Object.assign({}, z, { capInt: z.capInt + 500000, end: z.end + 500000 }) : z)) }); }; return () => { window.bkDevFundingV10 = o; }; } },
];

/* ------------------------------------------------------------------ run */
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  let nScen = 0, checks = 0, fails = 0; const records = [], coverage = {}, cover = (k) => { coverage[k] = (coverage[k] || 0) + 1; };
  const open = async (deal) => { const p = await b.newPage({ viewport: { width: 1400, height: 900 } }); p.errs = []; p.on('pageerror', (e) => p.errs.push(e.message));
    await p.route(/supabase\.co|vercel\.app|fonts\.g|cdn\.jsdelivr/, (r) => r.abort()); await p.goto('file://' + FILE); await p.waitForTimeout(700);
    await p.evaluate((d) => { document.documentElement.classList.add('bk-auth-ok'); bkCreateNewDeal(d); const s = bkLoad(); Object.assign(s, d); bkSave(s); }, deal); await p.evaluate("window.__fsProbe = " + PROBE.toString()); return p; };
  const probe = (p, ov) => p.evaluate((ov) => window.bkRunWith(ov, window.__fsProbe), ov);
  const report = (tag, sc, R, facts, P) => {
    const bad = R.filter((r) => !r.ok); nScen++; checks += R.length; fails += bad.length;
    const rec = { deal: tag, name: sc.name, reg: sc.reg || null, invalid: !!sc.invalid, checks: R.length, failed: bad.map((r) => r.id), tieOk: P.tie.ok, failedTies: P.F.ties.filter((q) => !q[1]).map((q) => q[0]), integrityHard: P.hard, allInputsFailed: P.tie.failed, sourcesLessUses: num(P.F.totalSources) - num(P.F.totalUses), equityShown: P.F.equity, equityEngine: P.F.engineEquity, closingEquity: num(P.F.measures && P.F.measures.closingEquity.amount), contributedEquity: num(P.F.measures && P.F.measures.totalContributedEquity.amount), operatingCashRequirement: num(P.F.measures && P.F.measures.operatingCashRequirement.amount), capitalCalledAfterClosing: num(P.F.measures && P.F.measures.callsTotal), totalProjectCapitalization: num(P.F.measures && P.F.measures.totalProjectCapitalization.amount), contributed: P.m.contrib, distributed: P.m.dist, irr: P.m.irr, moic: P.m.moic };
    records.push(rec);
    console.log((bad.length ? 'FAIL ' : 'PASS ') + tag + ' | ' + sc.name + (sc.reg ? ' [regression ' + sc.reg + ']' : '') + (sc.invalid ? ' [invalid configuration]' : '') + ' | ' + (R.length - bad.length) + '/' + R.length + ' checks' + (bad.length ? ' | ' + bad.map((r) => r.id + (r.detail ? ' (' + r.detail.slice(0, 220) + ')' : '')).join(' ;; ') : ''));
    return bad.length;
  };
  const PAGE = { dev: ['base', 'initial reserves 1M funded at close (interest)', 'interest reserve 1M + ceiling at the committed amount', 'conCeiling tight', 'fixed facility', 'holdYears 3', 'takeout sized by LTV 0.20 (large shortfall)', 'operating reserve 200k with 30% vacancy (lease-up deficit funded, reserve drawn)', 'refinance at stabilization off (construction loan held to sale)'], acq: ['base', 'rate cap premium', 'refinance at maturity, low refinance LTV (equity called)'] };
  for (const [tag, deal, kind, hard] of [['Harbor Point', H, 'dev', 30000000], ['audit development deal', V, 'dev', 25000000], ['acquisition deal', A, 'acq', 0]]) {
    const p = await open(deal), baseP = await probe(p, {});
    const list = (kind === 'dev' ? devScenarios(hard, baseP) : acqScenarios()).filter((sc) => !ONLY || sc.name.toLowerCase().indexOf(ONLY.toLowerCase()) >= 0);
    for (const sc of list) {
      const P = Object.keys(sc.ov).length === 0 ? baseP : await probe(p, sc.ov), out = kind === 'dev' ? checkDev(P, sc) : checkAcq(P, sc), f = out.facts;
      if (kind === 'dev') { cover('development scenarios'); if (f.resInt > 1) cover('interest reserve drawn'); if (f.resLease > 1) cover('operating reserve drawn in the ledger'); if (f.resFund > 1 && f.resInt + f.resLease < 1) cover('reserve funded but not drawn'); if (f.excess > 1) cover('interest paid currently beyond the facility limit');
        if (f.ceilingAboveCommit) cover('ceiling above the committed amount'); if (f.peakOverCommit) cover('balance above the committed amount (interest capitalized past the commitment)'); if (f.fixed) cover('fixed facility'); if (f.noLoan) cover('no construction loan'); if (f.shortfall > 1 && f.inHold) cover('takeout shortfall called inside the hold'); if (f.shortfall > 1 && !f.inHold) cover('takeout shortfall never called (sale before stabilization)');
        if (f.proceeds > 1) cover('takeout with cash-out proceeds'); if (f.opInd > 1) cover('lease-up operating shortfall funded by the partners'); if (f.netted > 0.5) cover('operating reserve draw repaid out of a month with surplus cash'); if (f.leaseDef > 1) cover('lease-up deficit funded in the ledger'); if (f.saleBeforeStab) cover('valid sale between completion and stabilization'); if (sc.invalid) cover('invalid hold (ends at or before completion)'); }
      else { cover('acquisition scenarios'); if (f.cap) cover('acquisition rate cap'); if (f.refi) cover('acquisition refinance at maturity'); if (f.debtOff) cover('acquisition without debt'); if (f.refiCall) cover('acquisition capital call for a refinance shortfall'); if (f.balloonCall) cover('acquisition capital call for balloon equity'); }
      if (!sc.invalid || kind === 'acq') { const pg = PAGE[kind].indexOf(sc.name) >= 0 ? await pageChecks(p, tag, deal, sc) : []; out.R.push.apply(out.R, pg); if (pg.length) cover('page and PDF checks'); }
      report(tag, sc, out.R, f, P);
    }
    if (!ONLY) { const again = await probe(p, {}); checks++; const same = near(again.F.totalUses, baseP.F.totalUses, 0.01) && near(again.m.contrib, baseP.m.contrib, 0.01) && near(again.F.equity, baseP.F.equity, 0.01) && near(again.F.measures.totalProjectCapitalization.amount, baseP.F.measures.totalProjectCapitalization.amount, 0.01) && near(again.F.measures.operatingCashRequirement.amount, baseP.F.measures.operatingCashRequirement.amount, 0.01);
      if (!same) fails++; console.log((same ? 'PASS ' : 'FAIL ') + tag + ' | harness: the base deal gives the same result after every scenario and page check (no state carried from one scenario to the next)' + (same ? '' : ' | uses ' + money(again.F.totalUses) + ' vs ' + money(baseP.F.totalUses))); }
    if (p.errs.length) { checks++; fails++; console.log('FAIL ' + tag + ' | page errors: ' + p.errs.slice(0, 2).join(' | ')); } else checks++;
    await p.close();
  }
  /* mutations */
  if (!ONLY) for (const mu of MUTS) {
    const p = await open(mu.deal === 'H' ? H : mu.deal === 'A' ? A : V), sc = { name: mu.name, ov: mu.ov };
    const P = await p.evaluate(([src, ov]) => { const restore = eval('(' + src + ')')(); try { bkPerfClear(); return window.bkRunWith(ov, window.__fsProbe); } finally { restore(); bkPerfClear(); } }, [mu.mut.toString(), mu.ov]);
    const R = (mu.deal === 'A' ? checkAcq : checkDev)(P, sc).R, caught = R.filter((r) => !r.ok).map((r) => r.id), ok = mu.want.some((w) => caught.indexOf(w) >= 0);
    checks++; if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + 'mutation | ' + mu.name + ' | the suite fails it (' + (caught.join(', ') || 'nothing failed') + '), wanted ' + mu.want.join(' or ')); await p.close();
  }
  /* the Debt page reconciliation rows used to carry a tolerance of a billion dollars and could not fail: with the facility tampered with they must now say so */
  if (!ONLY) { const p = await open(H);
    const t = await p.evaluate(async () => { const o = window.bkDevFundingV10; window.bkDevFundingV10 = function () { const f = o.apply(this, arguments); return Object.assign({}, f, { months: f.months.map((z) => (z.mo >= 20 ? Object.assign({}, z, { capInt: z.mo === 20 ? z.capInt + 500000 : z.capInt, end: z.end + 6000000 }) : z)) }); }; bkPerfClear(); showSheet('Debt'); await new Promise((r) => setTimeout(r, 800)); return document.getElementById('viewport').innerText; });
    const ok = /VARIANCE/.test(t) && /OVER CEILING/.test(t); checks++; if (!ok) fails++;
    console.log((ok ? 'PASS ' : 'FAIL ') + 'mutation | Debt page: capitalized interest $500,000 past what the sources cover and a balance $6,000,000 over the ceiling | the reconciliations show ' + ['VARIANCE', 'OVER CEILING', 'TIES', 'WITHIN CEILING'].filter((w) => t.indexOf(w) > -1).join(', ')); await p.close(); }
  /* the suite must exercise what it claims to */
  const NEED = ['interest reserve drawn', 'operating reserve drawn in the ledger', 'reserve funded but not drawn', 'interest paid currently beyond the facility limit', 'ceiling above the committed amount', 'balance above the committed amount (interest capitalized past the commitment)', 'fixed facility', 'no construction loan',
    'takeout shortfall called inside the hold', 'takeout shortfall never called (sale before stabilization)', 'takeout with cash-out proceeds', 'lease-up operating shortfall funded by the partners', 'lease-up deficit funded in the ledger', 'operating reserve draw repaid out of a month with surplus cash', 'acquisition capital call for a refinance shortfall', 'acquisition capital call for balloon equity', 'valid sale between completion and stabilization', 'invalid hold (ends at or before completion)', 'acquisition rate cap', 'acquisition refinance at maturity', 'acquisition without debt', 'page and PDF checks'];
  if (!ONLY) { const miss = NEED.filter((k) => !coverage[k]); checks++; if (miss.length) fails++; console.log((miss.length ? 'FAIL ' : 'PASS ') + 'coverage | the scenarios exercise every case the suite claims to' + (miss.length ? ' | never exercised: ' + miss.join('; ') : ' (' + NEED.map((k) => coverage[k] + ' x ' + k).join('; ') + ')')); }
  if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify(records, null, 1));
  console.log('funding scenarios: ' + nScen + ' scenarios, ' + checks + ' checks, ' + fails + ' failures'); await b.close(); process.exit(fails ? 1 : 0);
})();
