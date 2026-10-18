// Dumps the app's MACRS percentages for the combinations in macrs_tables_test.py.   node audit/macrs_tables_run.js index.html out.json
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); const path = require('path'), fs = require('fs');
const KEYS = [['5','200DB','HY',1,1],['7','200DB','HY',1,1],['15','150DB','HY',1,1],['5','200DB','MQ',1,1],['5','200DB','MQ',2,4],['5','200DB','MQ',3,7],['5','200DB','MQ',4,10],['7','200DB','MQ',4,10],['27.5','SL','MM',1,1],['27.5','SL','MM',1,12],['39','SL','MM',1,1],['39','SL','MM',1,12]];
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined }); const p = await b.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message)); await p.route(/supabase\.co|vercel\.app|fonts\.g/, r => r.abort());
  await p.goto('file://' + path.resolve(process.argv[2])); await p.waitForTimeout(800);
  const out = await p.evaluate(keys => Object.fromEntries(keys.map(k => [k.join('|'), bkMacrs.rates(Number(k[0]), k[1], k[2], k[3], k[4]).map(x => x * 100)])), KEYS);
  Object.keys(out).forEach(k => out[k] = out[k].map(x => x / 100)); out.__errors = errs;
  fs.writeFileSync(process.argv[3], JSON.stringify(out)); await b.close(); console.log(errs.length + ' page errors');
})();
