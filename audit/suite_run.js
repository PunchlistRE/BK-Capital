// Runs the whole deal book (deals/index.js) through the app, one fresh browser context per deal, and
// writes every engine result to JSON. Options make the run deliberately awkward so repeatability can
// be proven: --reverse (reverse deal order), --tz <IANA zone>, --date <ISO date> (frozen system clock),
// --roundtrip (save each deal through the cloud mappers - the app's real save/reopen path - reopen it and require identical results).
//   node audit/suite_run.js index.html out.json [--reverse] [--tz Pacific/Kiritimati] [--date 2031-06-30] [--roundtrip]
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const path = require('path'), fs = require('fs');
const argv = process.argv.slice(2), flag = n => argv.indexOf('--' + n) >= 0, opt = n => (argv.indexOf('--' + n) >= 0 ? argv[argv.indexOf('--' + n) + 1] : null);
let BOOK = require(path.join(__dirname, 'deals', 'index.js'));
if (flag('reverse')) BOOK = BOOK.slice().reverse();

const collect = (kind, withTax) => {
  // calendar dates as the user sees them (local), never via UTC: a Date at local midnight shifts a day in UTC for zones east of Greenwich
  const ld = d => { d = new Date(d); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  if (withTax && typeof bkEnsureV18 === 'function') bkEnsureV18();   // the after-tax engine writes its tax-rate defaults on first use: do it before anything is captured
  const s = bkLoad(), r = {};
  if (kind === 'acq') {
    const u = bkAnnualCF(), d = bkDebt(), x = bkMonthlyReturns(), w = bkWaterfallV07();
    let maxMonthGap = 0, conSum = 0, lpgpCon = 0, distSum = 0, lpgpDist = 0, splitErr = 0;
    const tiers = { t1: 0, catchup: 0, t2: 0, t3: 0, t4: 0 }, gs = Number(s.gpShare);
    w.rows.forEach(q => {
      Object.keys(tiers).forEach(k => tiers[k] += q[k]);
      const lpWant = q.t1 * (1 - gs) + q.t2 * s.t2LP + q.t3 * s.t3LP + q.t4 * s.t4LP;
      splitErr = Math.max(splitErr, Math.abs(q.lpDist - lpWant), Math.abs(q.gpDist - (q.t1 + q.catchup + q.t2 + q.t3 + q.t4 - lpWant)));
      maxMonthGap = Math.max(maxMonthGap, Math.abs(q.lpDist + q.gpDist - q.dist));
      conSum += q.con; lpgpCon += -(q.lpCon + q.gpCon); distSum += q.dist; lpgpDist += q.lpDist + q.gpDist;
    });
    const posCF = x.rows.reduce((z, q) => z + Math.max(0, q.wfDist != null ? q.wfDist : q.cf), 0);
    Object.assign(r, { s, conv: bkConventions(s), stmtNOI: bkCalc().after, y1NOI: u.arr[0].after, loan: d.loan, equity: d.equity, ltvValue: d.ltvValue, binding: d.binding,
      grossSale: u.grossSale, levIRR: x.irr, levMOIC: x.moic, unlevIRR: u.irr, unlevMOIC: u.moic, lpIRR: w.lpIRR, gpIRR: w.gpIRR, lpDist: w.lp.dist, gpDist: w.gp.dist,
      promote: w.promote, recon: { maxMonthGap, conSum, lpgpCon, distSum, lpgpDist, posCF, equity: d.equity, splitErr, tiers } });
    { const g = bkDealGate(), cp = g.capacity, rc = g.cushions;
      r.credit = { status: g.status, verdict: g.verdict, score: g.score, hard: g.hard, soft: g.soft, passed: g.passed, applicable: g.applicable, overrideValid: g.overrideValid, action: g.action,
        rows: g.rows.map(x => ({ id: x.id, value: x.value, threshold: x.threshold, result: x.result })), exceptions: g.exceptions.map(x => x.severity + ': ' + x.message),
        capacity: cp && { capacity: cp.capacity, requested: cp.requested, overage: cp.overage, headroom: cp.headroom, binding: cp.binding.name, maxCoupon: cp.maxCoupon, rows: cp.rows.map(q => ({ name: q.name, max: q.max })),
          box: cp.box, ladder: cp.ladder.map(q => ({ ltv: q.ltv, loan: q.loan, dscr: q.dscr, stabDscr: q.stabDscr })) },
        cushions: rc, input: { policy: (s._policy || {}), ic: (s._ic || {}) } }; }
    r.conflicts = bkConflicts().map(c => ({ id: c.id, level: c.level, data: c.data }));
    if (withTax) {
      const x = bkAfterTaxV18(), dep = s._depr || {};
      r.tax = { src: x.deprSource, atIRR: x.atIRR, atMOIC: x.atMOIC, saleTax: x.saleTax, accumDepr: x.accumDepr, ordBase: x.ordinaryRecaptureBase || 0, unrecBase: x.recaptureBase, capBase: x.capGainBase,
        rows: x.rows.map(q => ({ taxYear: q.taxYear, noi: q.noi, interest: q.interest, depr: q.depr, taxable: q.taxableIncome, tax: q.taxDue })),
        input: { settings: dep.settings, components: dep.components, price: Number(s.purchasePrice), ptype: s.propertyType, close: String(s.closing), taxRate: x.s.taxRate, capGainsRate: x.s.capGainsRate, depRecaptureRate: x.s.depRecaptureRate,
          netSale: x.u.netSale, totalBasis: x.totalBasis, eq0: Number(x.r.rows[0].eqDraw) || 0, closeDt: ld(x.r.closeDt), fee: x.costSegFee || 0,
          months: x.r.rows.map((q, i) => ({ date: ld(q.dt), noi: Number(q.noi || 0) - Number(q.reserve || 0), interest: Number((x.d.months[i] || {}).interest || 0), cf: q.cf })) } };
      if (x.deprSource === 'macrs-tax-grade' && bkDepreciation().settings.costSeg) { const bn = bkCostSegBenefit(); r.tax.benefit = { y1: bn.yearOneDeduction, base1: bn.baselineYearOne, y1save: bn.yearOneTaxSavings, hold: bn.holdTaxSavings, extraSale: bn.extraSaleTax, accel: bn.acceleratedBasis, wbSavings: bn.workbookStyleSavings, wbPayback: bn.workbookPayback, fee: bn.fee, pv: bn.pvTaxSavings, irrWith: bn.irrWith, irrWithout: bn.irrWithout }; }
    }
  } else {
    const dv = bkDevV09(), f = bkDevFundingV10(), t = bkDevTakeoutV11(), m = bkDevMonthlyReturnsV12(), c = bkCalc();
    const pick = (x, ks) => Object.fromEntries(ks.map(k => [k, x[k]]));
    Object.assign(r, { s, calcNOI: c.noi, baseNOI: Math.max(0, Number(s.stabilizedNOI || 0) || Number(bkOperatingV02().noi || 0)),
      dv: pick(dv, ['hard', 'soft', 'unlev', 'land', 'close', 'acq', 'pre', 'leaseDef', 'preMo', 'conMo', 'luMo', 'co', 'stab', 'hold']),
      f: Object.assign(pick(f, ['commit', 'upfrontFees', 'actualCapInt', 'overflowTotal', 'equityTotal', 'levered', 'rate', 'stabVal']), { months: f.months }),
      t: pick(t, ['noi', 'stabVal', 'ltvCap', 'dscrLoan', 'dyLoan', 'permLoan', 'permFee', 'conPayoff', 'refiProceeds', 'refiShortfall', 'bindingTest', 'permDebtAtSale']),
      m: { irr: m.irr, moic: m.moic, rows: m.rows.map(q => Object.assign({}, q, { dt: ld(q.dt) })), values: m.values, dates: m.dates.map(ld) } });
  }
  // underscore keys and seededAt are provenance stamps (timestamps, who created it), not economics: excluded so runs are comparable
  const canon = v => Array.isArray(v) ? v.map(canon) : (v && typeof v === 'object') ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canon(v[k])])) : v;
  return canon(JSON.parse(JSON.stringify(r, (k, v) => (k.charAt(0) === '_' || k === 'seededAt') ? undefined : (typeof v === 'number' && !isFinite(v)) ? 'NaN' : v)));
};

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const out = [], errs = [];
  for (const item of BOOK) {
    const ctx = await b.newContext(opt('tz') ? { timezoneId: opt('tz') } : {});
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(item.id + ': ' + e.message));
    if (opt('date')) await p.clock.install({ time: new Date(opt('date') + 'T12:00:00Z') });
    await p.route(/supabase\.co|vercel\.app|fonts\.g/, r => r.abort());
    await p.goto('file://' + path.resolve(argv[0])); await p.waitForTimeout(800);
    const res = await p.evaluate(([deal, src, setup]) => { bkCreateNewDeal(deal); if (setup) (0, eval)(setup); return (0, eval)('(' + src + ')')(deal.dealType === 'Development' ? 'dev' : 'acq', !!setup); }, [item.deal, collect.toString(), item.setup || null]);
    const rec = { id: item.id, kind: item.kind, purpose: item.purpose, res };
    if (flag('roundtrip')) {
      const again = await p.evaluate(([src, setup]) => {
        const st = JSON.parse(localStorage.getItem('bkcapital.cre.v02'));
        const restored = bkMap.reconstructState(bkMap.stateToDealRow(st), { input_data: bkMap.stateToInputData(st), source_data: {} }, []);
        window.bkProvision('cloud-load', restored);
        return (0, eval)('(' + src + ')')(bkLoad().dealType === 'Development' ? 'dev' : 'acq', !!setup);
      }, [collect.toString(), item.setup || null]);
      rec.roundTripIdentical = JSON.stringify(again) === JSON.stringify(res);
      if (!rec.roundTripIdentical) {
        const diff = [], walk = (a, b, pth) => { if (a && b && typeof a === 'object' && typeof b === 'object') { for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) walk(a[k], b[k], pth + '.' + k); } else if (a !== b) diff.push(pth + ': ' + a + ' -> ' + b); };
        walk(res, again, item.id); console.log('NOT IDENTICAL AFTER SAVE/REOPEN:\n  ' + diff.slice(0, 6).join('\n  '));
      }
    }
    out.push(rec); await ctx.close();
  }
  out.sort((a, c) => a.id < c.id ? -1 : 1);
  fs.writeFileSync(argv[1], JSON.stringify({ deals: out, pageErrors: errs }));
  await b.close();
  console.log(out.length + ' deals, ' + errs.length + ' page errors' + (flag('roundtrip') ? ', round trip identical: ' + out.every(o => o.roundTripIdentical) : ''));
})();
