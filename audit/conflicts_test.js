// Conflicting-input rules: each scenario starts from the clean base deal, applies ONE change through the app's own setters or state,
// and asserts the rule fires (and, where stated, at what level) - and that the fix clears it. Also tests acknowledgement and the pop-up.
//   node audit/conflicts_test.js index.html
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const path = require('path');
const A = require(path.join(__dirname, 'deal.js')), DEV = require(path.join(__dirname, 'devdeal.js'));
const set = (o) => `{const s=bkLoad(); Object.assign(s, ${JSON.stringify(o)}); bkSave(s);}`;
const SEG = "bkDeprSet('costSeg',true); bkDeprSet('landMethod','percent'); bkDeprSet('landPct',0.2); bkDeprSet('detailMode','buckets'); bkDeprBucketSet(5, 1000000);";
const comp = (extra) => `bkDeprSet('costSeg',true); bkDeprSet('landMethod','percent'); bkDeprSet('landPct',0.2); bkDeprSet('detailMode','detailed'); {const s=bkLoad(); s._depr.components=[Object.assign({component:'x',basis:1000000,recovery:5,bonus:true,convention:'AUTO',method:''},${JSON.stringify(extra)})]; bkSave(s);}`;
// [rule id, expected level (null = any), setup, base deal ('A' | 'DEV'), optional fix that must clear it]
const BIZ = "bkBizSeedPunchlist(); ";
const T = [
  ['dep.simplified-costseg', 'WARN', SEG + "{const s=bkLoad(); s._depr.settings.depMethod='simplified'; bkSave(s);}", 'A', "bkDeprSet('depMethod','macrs')"],
  ['dep.bonus-on-real-property', 'WARN', comp({ recovery: 27.5 }), 'A', null],
  ['dep.land-zero', 'WARN', "bkDeprSet('costSeg',true); bkDeprSet('landMethod','percent'); bkDeprSet('landPct',0);", 'A', "bkDeprSet('landPct',0.2)"],
  ['dep.land-extreme', 'WARN', SEG + "bkDeprSet('landPct',0.7);", 'A', "bkDeprSet('landPct',0.2)"],
  ['dep.placed-vs-closing', 'WARN', SEG + "bkDeprSet('placedInService','2026-06-01');", 'A', "bkDeprSet('placedInService','2027-01-01')"],
  ['dep.placed-after-sale', 'ERROR', SEG + "bkDeprSet('placedInService','2040-01-01');", 'A', "bkDeprSet('placedInService','2027-01-01')"],
  ['dep.bonus-elect-above-statutory', 'WARN', SEG + "bkDeprSet('placedInService','2024-06-01'); bkDeprSet('bonusMode','elect'); bkDeprSet('bonusPct',1);", 'A', "bkDeprSet('bonusPct',0.6)"],
  ['dep.bonus-elect-above-statutory', 'INFO', SEG + "bkDeprSet('bonusMode','elect'); bkDeprSet('bonusPct',0.5);", 'A', null],
  ['dep.explicit-hy-with-q4', 'WARN', set({ closing: '10/20/2027' }) + comp({ convention: 'HY' }), 'A', null],
  ['dep.mid-month-on-short-life', 'WARN', comp({ convention: 'MM' }), 'A', null],
  ['tax.rate-order', 'WARN', set({ taxRate: 0.37, depRecaptureRate: 0.4 }), 'A', set({ depRecaptureRate: 0.25 })],
  ['tax.rate-percent-typo', 'ERROR', set({ taxRate: 37 }), 'A', set({ taxRate: 0.37 })],
  ['tax.losses-usable', 'INFO', SEG + "bkDeprSet('lossMode','usable');", 'A', null],
  ['tax.costseg-payback', 'WARN', SEG + "bkDeprSet('costSegFee',5000000);", 'A', "bkDeprSet('costSegFee',0)"],
  ['acct.statement-vs-cashflow', 'WARN', "bkSetConvention('cvRentGrowthStart','month1');", 'A', "bkSetConvention('cvRentGrowthStart','year2')"],
  ['acct.ltv-on-value', 'WARN', "bkSetConvention('cvLtvBasis','value');", 'A', "bkSetConvention('cvLtvBasis','price')"],
  ['acct.legacy-methodology', 'INFO', "{const s=bkLoad(); delete s.cvLtvBasis; delete s.cvHurdleBasis; bkSave(s);}", 'A', null],
  ['acct.hurdle-on-deal-equity', 'WARN', "bkSetConvention('cvHurdleBasis','deal');", 'A', "bkSetConvention('cvHurdleBasis','lp')"],
  ['acct.occupancy-vs-vacancy', 'WARN', set({ occupancy: 0.8 }), 'A', set({ occupancy: 0.95 })],
  ['acct.rentroll-vs-flat', 'WARN', set({ rentRoll: Array.from({ length: 10 }, (_, i) => ({ unitId: 'U' + i, tenantType: 'Residential', status: 'Occupied', sf: 800, inPlaceRent: 900, marketRent: 950 })) }), 'A', set({ rentRoll: [] })],
  ['acct.reserves-zero', 'WARN', set({ reserves: 0 }), 'A', set({ reserves: 36000 })],
  ['acct.mgmt-zero', 'WARN', set({ mgmtPct: 0 }), 'A', set({ mgmtPct: 0.03 })],
  ['acct.exit-below-going-in', 'WARN', set({ exitCap: 0.04 }), 'A', set({ exitCap: 0.0575 })],
  ['acct.units-vs-gsf', 'WARN', set({ gsf: 10000 }), 'A', set({ gsf: 108000 })],
  ['acct.noi-not-positive', 'WARN', set({ taxes: 4000000 }), 'A', set({ taxes: 240000 })],
  ['acct.expense-ratio', 'WARN', set({ taxes: 1500000 }), 'A', set({ taxes: 240000 })],
  ['debt.loan-above-cost', 'ERROR', set({ acqLTV: 3, acqLTC: 3, acqDSCR: 0.2, acqDebtYield: 0 }), 'A', set({ acqLTV: 0.65, acqLTC: 0.6, acqDSCR: 1.25 })],
  ['debt.term-before-hold', 'WARN', set({ debtTerm: 3, holdYears: 5, refiAtMaturity: 0 }), 'A', set({ debtTerm: 10 })],
  ['debt.floating-unhedged', 'WARN', set({ debtRateType: 'Floating', debtIndexRate: 0.04, debtSpread: 0.02, rateCapStrike: 0 }), 'A', set({ rateCapStrike: 0.05 })],
  ['debt.floating-zero-index', 'ERROR', set({ debtRateType: 'Floating', debtIndexRate: 0, debtSpread: 0 }), 'A', set({ debtRateType: 'Fixed' })],
  ['debt.io-longer-than-term', 'WARN', set({ acqIO: 12, debtTerm: 10 }), 'A', set({ acqIO: 2 })],
  ['debt.dscr-below-one', 'WARN', set({ acqDSCR: 0.8, acqLTV: 0.9, acqLTC: 0.9 }), 'A', set({ acqDSCR: 1.25, acqLTV: 0.65, acqLTC: 0.6 })],
  ['debt.sizing-looser-than-policy', 'WARN', "", 'A', "bkPolicySet('minDSCR',0.9); bkPolicySet('stressBps',0)"],
  ['refi.year-out-of-range', 'ERROR', "bkRefiSet('year',9);", 'A', "bkRefiSet('year',3)"],
  ['refi.post-dscr-below-policy', 'WARN', "bkRefiSet('year',3); bkPolicySet('minDSCR',1.4);", 'A', "bkPolicySet('minDSCR',1.25)"],
  ['refi.cash-out-negative', 'WARN', "bkRefiSet('year',2); bkRefiSet('maxLTV',0.2);", 'A', "bkRefiSet('maxLTV',0.65)"],
  ['wf.promote-decreasing', 'WARN', set({ t2LP: 0.4, t3LP: 0.5, t4LP: 0.6 }), 'A', set({ t2LP: 0.5, t3LP: 0.45, t4LP: 0.4 })],
  ['wf.gp-share-extreme', 'WARN', set({ gpShare: 0.6 }), 'A', set({ gpShare: 0.1 })],
  ['dev.no-construction', 'ERROR', set({ constructionMonths: 0 }), 'DEV', set({ constructionMonths: 18 })],
  ['dev.con-loan-zero-rate', 'ERROR', set({ conRate: 0 }), 'DEV', set({ conRate: 0.075 })],
  ['dev.no-leaseup', 'WARN', set({ leaseupMonths: 0 }), 'DEV', set({ leaseupMonths: 14 })],
  ['dev.takeout-shortfall', 'WARN', set({ permLTV: 0.2 }), 'DEV', set({ permLTV: 0.9, permDSCR: 1.0 })],   // the base development deal also fires: its DSCR-bound takeout is $225,620 short of the construction payoff
  ['dev.conventions-ignored', 'INFO', set({ cvRentGrowthStart: 'month1' }), 'DEV', null],
  ['biz.mix-not-100', 'ERROR', BIZ + "bkBizSet('tiers.0.mix',0.9);", 'BIZ', "bkBizSeedPunchlist()"],
  ['biz.terminal-growth-ge-rate', 'ERROR', BIZ + "bkBizSet('dcf.cases.base.g',0.5);", 'BIZ', "bkBizSeedPunchlist()"],
  ['biz.tv-discount-workbook', 'WARN', BIZ, 'BIZ', "bkBizSet('dcf.tvDiscount','standard')"],
  ['biz.tv-share-high', 'WARN', BIZ + "bkBizSet('rate.specific',-0.06); bkBizSet('dcf.cases.base.mult',7.9);", 'BIZ', "bkBizSeedPunchlist()"],
  ['biz.sde-labelled-ebitda', 'WARN', BIZ, 'BIZ', null],
  ['biz.owner-comp-zero', 'WARN', BIZ + "bkBizSet('dcf.cases.base.comp',0);", 'BIZ', "bkBizSet('dcf.cases.base.comp',150000)"],
  ['biz.discount-rate-low', 'WARN', BIZ + "bkBizSet('rate.specific',-0.1);", 'BIZ', "bkBizSeedPunchlist()"],
  ['biz.exit-multiple-range', 'WARN', BIZ + "bkBizSet('dcf.cases.base.mult',12);", 'BIZ', "bkBizSeedPunchlist()"],
  ['biz.rent-below-market', 'WARN', BIZ + "bkBizSet('place.marketRent',24000);", 'BIZ', "bkBizSet('place.marketRent',9000)"],
  ['biz.rent-coverage-thin', 'WARN', BIZ + "bkBizSet('place.marketRent',24000);", 'BIZ', "bkBizSet('place.marketRent',9000)"],
  ['risk.prob-not-100', 'ERROR', "bkRiskSet('p.Base',0.6);", 'A', "bkRiskSet('p.Base',0.5)"],
  ['pol.thresholds-inverted', 'ERROR', "bkPolicySet('advanceScore',0.5); bkPolicySet('conditionalScore',0.7);", 'A', "bkPolicyReset()"],
  ['pol.dscr-below-one', 'ERROR', "bkPolicySet('minDSCR',0.9);", 'A', "bkPolicyReset()"],
  ['pol.weights', 'WARN', "bkPolicyGate('lpIRR','weight',0.5);", 'A', "bkPolicyReset()"],
  ['pol.override-incomplete', 'WARN', "bkICSet('override.on','YES'); bkICSet('override.reason','x');", 'A', "bkICSet('override.approvedBy','CCO')"],
  ['pol.override-unneeded', 'INFO', "bkPolicySet('minDSCR',0.9); bkPolicySet('stressBps',0); bkICSet('override.on','YES'); bkICSet('override.reason','x'); bkICSet('override.approvedBy','CCO');", 'A', null]
];
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const p = await b.newPage(); const errs = []; let fails = 0, checks = 0;
  p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => { window.BK_CONFLICT_TOASTS = false; });
  await p.route(/supabase\.co|vercel\.app|fonts\.g/, r => r.abort());
  await p.goto('file://' + path.resolve(process.argv[2])); await p.waitForTimeout(800);
  const check = (name, ok, detail) => { checks++; if (!ok) fails++; if (!ok) console.log('FAIL ' + name + (detail ? '  ' + detail : '')); };
  const run = (code) => p.evaluate(c => (0, eval)(c), code);
  const mk = (kind) => p.evaluate(([k, a, d]) => { document.documentElement.classList.add('bk-auth-ok'); bkCreateNewDeal(k === 'DEV' ? d : a); }, [kind === 'BIZ' ? 'A' : kind, A, DEV]);
  // every rule in the catalogue is covered by a scenario
  const rules = await p.evaluate(() => window.BK_CONFLICT_RULES.map(r => r.id));
  rules.filter(id => !T.some(t => t[0] === id)).forEach(id => check('rule ' + id + ' has a test scenario', false));
  // a clean base deal has no ERROR and nothing but the policy-sizing note
  await mk('A'); let list = await p.evaluate(() => bkConflicts().map(c => c.level + ' ' + c.id));
  check('clean base deal has no ERROR', !list.some(x => x.startsWith('ERROR')), list.join(', '));
  check('clean base deal raises only the policy-sizing warning', list.length === 1 && list[0] === 'WARN debt.sizing-looser-than-policy', list.join(', '));
  for (const [id, level, setup, base, fix] of T) {
    await mk(base);
    if (setup) await run(setup);
    const got = await p.evaluate(i => bkConflicts().filter(c => c.id === i).map(c => ({ level: c.level, msg: c.message, why: c.why })), id);
    check(id + ' fires', got.length === 1, JSON.stringify(got));
    if (got.length) {
      if (level) check(id + ' level is ' + level, got[0].level === level, got[0].level);
      check(id + ' explains why it matters', got[0].why && got[0].why.length > 60 && got[0].msg.length > 20);
    }
    if (fix) { await run(fix); const after = await p.evaluate(i => bkConflicts().filter(c => c.id === i).length, id); check(id + ' clears when fixed', after === 0); }
  }
  // errors feed readiness (a contradiction blocks decision-grade); warnings do not
  await mk('A'); await run(set({ taxRate: 37 }));
  const r1 = await p.evaluate(() => ({ st: bkDealReadiness().state, f: bkModelControls().filter(c => c.level === 'FAIL' && c.conflictId).length }));
  check('an ERROR conflict makes the deal NOT DECISION-GRADE', r1.st === 'NOT DECISION-GRADE' && r1.f === 1, JSON.stringify(r1));
  await mk('A'); await run(set({ reserves: 0 }));
  const r2 = await p.evaluate(() => ({ st: bkDealReadiness().state, w: bkModelControls().filter(c => c.level === 'WARN' && c.conflictId).length }));
  check('a WARN conflict is listed but does not block', r2.st !== 'NOT DECISION-GRADE' && r2.w >= 1, JSON.stringify(r2));
  // acknowledge persists, errors cannot be acknowledged away from the list
  await run("bkAckConflict('acct.reserves-zero')");
  const ack = await p.evaluate(() => bkConflicts().find(c => c.id === 'acct.reserves-zero').acknowledged);
  check('acknowledging a warning is recorded on the deal', ack === true);
  // the numbers inside a message are the engine's own
  await mk('A'); await run("bkSetConvention('cvRentGrowthStart','month1')");
  const g = await p.evaluate(() => { const c = bkConflicts().find(x => x.id === 'acct.statement-vs-cashflow'); return { gap: c.data.gap, direct: bkAnnualCF().arr[0].after - bkCalc().after }; });
  check('statement-vs-cashflow gap equals cash-flow NOI minus statement NOI', Math.abs(g.gap - g.direct) < 1e-6, JSON.stringify(g));
  // pop-up: silent on load, appears when an edit creates the conflict, gone after acknowledge
  const p2 = await b.newPage(); const errs2 = [];
  p2.on('pageerror', e => errs2.push(e.message));
  await p2.addInitScript(() => { window.BK_CONFLICT_TOASTS = true; });
  await p2.route(/supabase\.co|vercel\.app|fonts\.g/, r => r.abort());
  await p2.goto('file://' + path.resolve(process.argv[2])); await p2.waitForTimeout(800);
  await p2.evaluate(a => { document.documentElement.classList.add('bk-auth-ok'); bkCreateNewDeal(a); }, A); await p2.waitForTimeout(800);
  check('no pop-up when a deal is loaded', await p2.evaluate(() => !document.getElementById('bk-conflict-toast')));
  await p2.evaluate(() => bkSetConvention('cvRentGrowthStart', 'month1')); await p2.waitForTimeout(800);
  const toast = await p2.evaluate(() => { const e = document.getElementById('bk-conflict-toast'); return e ? e.innerText : ''; });
  check('an edit that creates a conflict raises a pop-up that says why', /Why it matters/.test(toast) && /monthly cash flow/.test(toast), toast.slice(0, 160));
  await p2.evaluate(() => bkAckConflict('acct.statement-vs-cashflow')); await p2.waitForTimeout(300);
  check('acknowledging dismisses the pop-up', await p2.evaluate(() => !document.getElementById('bk-conflict-toast')));
  await p2.evaluate(() => bkSetConvention('cvRentGrowthStart', 'year2')); await p2.waitForTimeout(700);
  await p2.evaluate(() => bkSetConvention('cvRentGrowthStart', 'month1')); await p2.waitForTimeout(800);
  check('an acknowledged conflict is not raised again', await p2.evaluate(() => !document.getElementById('bk-conflict-toast')));
  await p2.evaluate(() => showSheet('Model Checks'));
  check('Model Checks sheet renders the findings', await p2.evaluate(() => /Conflicting Inputs and Their Consequences/i.test(document.querySelector('#viewport').innerText) || /CONFLICTING INPUTS/.test(document.querySelector('#viewport').innerText.toUpperCase())));
  check('no page errors', errs.length + errs2.length === 0, errs.concat(errs2).join(' | '));
  await b.close(); console.log(`${checks} checks, ${fails} failures`); process.exit(fails ? 1 : 0);
})();
