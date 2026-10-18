// Dumps the realistic development fixture's engine output for dev_audit.py.
//   node audit/dev_run.js index.html out.json
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const path = require('path'), fs = require('fs');
const DEV = require(path.join(__dirname, 'devdeal.js'));
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const p = await b.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.route(/supabase\.co|vercel\.app|fonts\.g/, r => r.abort());
  await p.goto('file://' + path.resolve(process.argv[2])); await p.waitForTimeout(800);
  const out = await p.evaluate(o => {
    bkCreateNewDeal(o);
    const dv = bkDevV09(), f = bkDevFundingV10(), t = bkDevTakeoutV11(), m = bkDevMonthlyReturnsV12(), c = bkCalc();
    const pick = (x, ks) => Object.fromEntries(ks.map(k => [k, x[k]]));
    return {
      s: bkLoad(), calcNOI: c.noi,
      dv: pick(dv, ['hard', 'soft', 'unlev', 'land', 'close', 'acq', 'pre', 'leaseDef', 'preMo', 'conMo', 'luMo', 'co', 'stab', 'hold']),
      f: Object.assign(pick(f, ['commit', 'upfrontFees', 'actualCapInt', 'overflowTotal', 'equityTotal', 'levered', 'rate', 'stabVal']), { months: f.months }),
      t: pick(t, ['noi', 'stabVal', 'ltvCap', 'dscrLoan', 'dyLoan', 'permLoan', 'permFee', 'conPayoff', 'refiProceeds', 'refiShortfall', 'bindingTest', 'permDebtAtSale']),
      m: { irr: m.irr, moic: m.moic, rows: m.rows, values: m.values, dates: m.dates.map(d => new Date(d).toISOString().slice(0, 10)) }
    };
  }, DEV);
  out.pageErrors = errs; fs.writeFileSync(process.argv[3], JSON.stringify(out)); await b.close();
})();
