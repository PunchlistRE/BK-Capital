// Property Valuation: an analysis with its own engine on the registry. In-place, normalized and stabilized NOI, value by cap rate, comparables and sensitivity against an
// independent model (audit/val_ref.py); missing inputs; readiness, step bar, Overview tiles and the guide from the registry; the report built section by section in the registry's order.
//   node audit/valuation_test.js index.html
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); const path = require('path'); const fs = require('fs'); const os = require('os'); const cp = require('child_process');
const D = require(path.join(__dirname, 'valdeal.js')), A = require(path.join(__dirname, 'deal.js'));
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined }); const p = await b.newPage({ viewport: { width: 1400, height: 900 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route(/supabase\.co|vercel\.app|fonts\.g|cdn\.jsdelivr/, r => r.abort()); await p.goto('file://' + path.resolve(process.argv[2])); await p.waitForTimeout(700);
  let checks = 0, fails = 0; const check = (n, ok, d) => { checks++; if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? '  [' + String(d).slice(0, 300) + ']' : '')); };
  await p.evaluate(() => document.documentElement.classList.add('bk-auth-ok'));
  const open = (d) => p.evaluate((x) => { bkCreateNewDeal(x); const s = bkLoad(); Object.assign(s, x); bkSave(s); return JSON.parse(JSON.stringify(bkLoad())); }, d);
  const eng = () => p.evaluate(() => { const r = bkValuation(); return { ok: r.ok, egi: r.calc.egi, opex: r.calc.total, scen: Object.fromEntries(r.scenarios.map(x => [x.id, { noi: x.noi, cap: x.cap, value: x.value, perUnit: x.perUnit, perSF: x.perSF, asIs: x.asIs }])), conclusion: r.conclusionId, value: r.conclusion.value, cs: r.compStats, sens: r.sens.map(x => x.value), checks: r.checks, missing: r.missing }; });
  const bd = () => p.evaluate(() => bkConventions(bkLoad()).cvBadDebtBasis);
  const ref = (s, basis) => { s = Object.assign({}, s, { _bdBasis: basis }); const f = path.join(os.tmpdir(), 'bk-val-' + process.pid + '.json'); fs.writeFileSync(f, JSON.stringify(s)); return JSON.parse(cp.execSync('python3 ' + JSON.stringify(path.join(__dirname, 'val_ref.py')) + ' ' + JSON.stringify(f)).toString()); };
  const near = (a, b2, t) => Math.abs(a - b2) <= (t || 1e-9) * Math.max(1, Math.abs(b2));

  let s = await open(D), e = await eng(), r = ref(s, await bd());
  check('the registry is consistent with Property Valuation live', await p.evaluate(() => BKReg.lint().length === 0 && BKReg.analysis('valuation').live), await p.evaluate(() => BKReg.lint().join(' | ')));
  check('independent model: effective gross income and operating expenses agree', near(e.egi, r.egi) && near(e.opex, r.opex), JSON.stringify([e.egi, r.egi, e.opex, r.opex]));
  check('independent model: in-place, normalized and stabilized NOI, cap rate, value, per unit and per SF agree', ['inplace', 'normalized', 'stabilized'].every(k => ['noi', 'cap', 'value', 'perUnit', 'perSF'].every(f => near(e.scen[k][f], r.scen[k][f]))), JSON.stringify([e.scen, r.scen]));
  check('the stabilized case carries its own cap rate, and its as-is value deducts the cost to stabilize', e.scen.stabilized.cap === 0.0575 && near(e.scen.stabilized.asIs, r.scen.stabilized.asIs), e.scen.stabilized.asIs);
  check('the concluded value is the normalized NOI / the market cap rate, as chosen', e.conclusion === 'normalized' && near(e.value, r.value) && near(e.value, (e.scen.inplace.noi - 9000) / 0.06), e.value);
  check('independent model: the comparables\' median cap rate (one derived from NOI / price), price per unit and per SF agree', near(e.cs.medCap, r.medCap) && near(e.cs.medUnit, r.medUnit) && near(e.cs.medSF, r.medSF) && e.cs.n === 3, JSON.stringify([e.cs, r.medCap, r.medUnit, r.medSF]));
  check('independent model: the cap-rate sensitivity agrees, and value falls as the cap rate rises', e.sens.length === 7 && e.sens.every((v, i) => near(v, r.sens[i])) && e.sens.every((v, i) => i === 0 || v < e.sens[i - 1]), JSON.stringify(e.sens));
  check('the internal checks tie (NOI, value, no financing)', e.checks.length === 3 && e.checks.every(c => c.ok), JSON.stringify(e.checks));
  { s = await open(Object.assign({}, D, { valConclusion: 'stabilized' })); const x = await eng(); check('concluding on stabilized NOI values the stabilized case', x.conclusion === 'stabilized' && near(x.value, r.scen.stabilized.value)); }
  { s = await open(Object.assign({}, D, { valStabilizedNoi: 500000 })); const x = await eng(); check('an entered stabilized NOI replaces the market-rent build', x.scen.stabilized.noi === 500000 && near(x.scen.stabilized.value, 500000 / 0.0575)); }
  { s = await open(Object.assign({}, D, { exLoanBalance: 4000000, acqRate: 0.07, purchasePrice: 5000000 })); const x = await eng(); check('financing and price inputs on the deal change no valuation figure', near(x.value, e.value) && near(x.scen.stabilized.value, e.scen.stabilized.value)); }
  /* missing inputs */
  { s = await open(Object.assign({}, D, { valCapRate: null, valDate: '' })); const x = await eng(); const rd = await p.evaluate(() => { const r = bkDealReadiness(); return { can: r.canCalculate, state: r.state, miss: r.missing.map(m => m.key) }; });
    check('with the cap rate and the date blank, nothing is valued and readiness lists exactly what is missing', !x.ok && !rd.can && rd.state === 'DRAFT' && rd.miss.includes('valCapRate') && rd.miss.includes('valDate'), JSON.stringify([x.missing, rd])); }
  /* readiness, step bar, tiles, guide */
  s = await open(D);
  const ui = await p.evaluate(() => { const rd = bkDealReadiness(); showSheet('Home'); const tiles = [...document.querySelectorAll('.pl-kpi .k')].map(x => x.textContent); const steps = [...document.querySelectorAll('.bk-step')].map(x => x.textContent.replace(/^[^A-Za-z]+/, '')); const guide = bkGuideSections(bkLoad()).map(x => x.id).join(); return { rd: [rd.analysis, rd.state, rd.canCalculate], tiles, steps, guide }; });
  check('a complete valuation is ANALYSIS READY by its own required inputs (no price, hold, exit cap or loan needed)', ui.rd[0] === 'valuation' && ui.rd[1] === 'ANALYSIS READY' && ui.rd[2] === true, JSON.stringify(ui.rd));
  check('the step bar shows the valuation stages', ui.steps.join() === 'Property,Income,Expenses,Value,Report', ui.steps.join());
  check('the Overview leads with the estimated market value', ui.tiles[0] === 'Estimated market value' && ui.tiles.length >= 4, ui.tiles.join('|'));
  check('the guide walks the valuation workflow', /^property,mix,inplace,market,vacancy,expenses,noi,caprate,value/.test(ui.guide), ui.guide);
  /* the sheet and the report */
  const sh = await p.evaluate(() => { showSheet('Property Valuation'); const t = document.querySelector('#viewport').innerText; return { bad: /undefined|NaN/.test(t), scen: !!document.getElementById('pv-scen'), sens: !!document.getElementById('pv-sens'), comps: !!document.getElementById('pv-comps'), inputs: document.querySelectorAll('#viewport input.rf-in').length }; });
  check('the Property Valuation sheet shows the inputs, value by NOI, the sensitivity, the comparables and no undefined or NaN', !sh.bad && sh.scen && sh.sens && sh.comps && sh.inputs >= 8, JSON.stringify(sh));
  await p.fill('#pv-valCapRate', '6.5'); await p.dispatchEvent('#pv-valCapRate', 'change'); await p.waitForTimeout(300);
  check('typing a cap rate on the sheet writes it and re-values the property', await p.evaluate((v) => Math.abs(bkLoad().valCapRate - 0.065) < 1e-12 && bkValuation().conclusion.value < v, e.value));
  s = await open(D);
  const rp = await p.evaluate(() => { showSheet('Property Valuation Report'); return { secs: [...document.querySelectorAll('.rf-sec')].map(x => x.dataset.section), want: BKReg.report('valuation').map(x => x.id), txt: document.querySelector('#viewport').innerText }; });
  check('the report is built section by section in the registry\'s order', rp.secs.join() === rp.want.join() && rp.secs.length === 10, JSON.stringify(rp.secs));
  check('the report states the value the engine computed and that it is not an appraisal', rp.txt.includes('$' + Math.round(e.value).toLocaleString('en-US')) && /not an appraisal/.test(rp.txt) && !/undefined|NaN/.test(rp.txt), rp.txt.slice(0, 200));
  /* starting one from the setup page */
  await p.evaluate(() => { localStorage.removeItem('bkcapital.cre.v02'); }); await p.reload(); await p.waitForTimeout(900); await p.evaluate(() => { document.documentElement.classList.add('bk-auth-ok'); showSheet('Home'); }); await p.waitForTimeout(300);
  check('the Property Valuation card is live on the setup page', await p.evaluate(() => { const c = document.querySelector('.pl-an[data-analysis="valuation"]'); return !!c && !c.classList.contains('off'); }));
  await p.click('.pl-an[data-analysis="valuation"]'); await p.waitForTimeout(250); await p.fill('#pl-nm', 'Birch Row'); await p.click('#pl-modal button:has-text("Create")'); await p.waitForTimeout(500);
  const nd = await p.evaluate(() => { const s = bkLoad(), r = bkDealReadiness(), x = bkValuation(); return { a: s.analysisType, n: s.name, state: r.state, can: r.canCalculate, ok: x.ok }; });
  check('a new Property Valuation starts blank: nothing valued, readiness DRAFT', nd.a === 'valuation' && nd.n === 'Birch Row' && nd.state === 'DRAFT' && !nd.can && !nd.ok, JSON.stringify(nd));
  await open(A); check('an acquisition deal keeps its own readiness (unchanged)', await p.evaluate(() => { const r = bkDealReadiness(); return r.analysis === 'acquisition' && r.canCalculate === true && /READY/.test(r.state); }));
  check('no page errors', errs.length === 0, errs.join(' | '));
  console.log(checks + ' checks, ' + fails + ' failures'); await b.close(); process.exit(fails ? 1 : 0);
})();
