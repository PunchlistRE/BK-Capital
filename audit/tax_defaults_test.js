// Tax-rate defaults (owner-approved, November 2026). The after-tax engine supplies 37% / 25% / 20% when no rate is entered and saves them, which reads as if the investor had chosen them. They are now Expected inputs:
// labelled as the model's defaults, explained, flagged unconfirmed, the after-tax figures marked provisional until the user confirms. No tax calculation changes, no user-entered rate is overwritten.
//   node audit/tax_defaults_test.js index.html
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); const path = require('path');
const A = require(path.join(__dirname, 'deal.js'));
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  let checks = 0, fails = 0; const check = (n, ok, d) => { checks++; if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? '  [' + String(d).slice(0, 500) + ']' : '')); };
  const open = async (deal) => { const ctx = await b.newContext({ viewport: { width: 1300, height: 1000 } }), p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
    await p.route(/supabase\.co|vercel\.app|fonts\.g|cdn\.jsdelivr|newyorkfed/, r => r.abort()); await p.goto('file://' + path.resolve(process.argv[2])); await p.waitForTimeout(700);
    await p.evaluate((d) => { document.documentElement.classList.add('bk-auth-ok'); bkCreateNewDeal(d); }, deal); return p; };
  const patch = (p, x) => p.evaluate((x) => { const s = bkLoad(); Object.assign(s, x); bkSave(s); }, x);
  const st = (p) => p.evaluate(() => { const o = {}; ['taxRate', 'depRecaptureRate', 'capGainsRate'].forEach(k => { const t = bkTaxRateStatus(k); o[k] = t.state + '|' + t.source; }); return o; });
  const p = await open(A);

  /* ---- where each rate stands ---- */
  const s0 = await st(p);
  check('with no rates entered each is provisional and its source says "Model default, not entered"', Object.values(s0).every(v => v === 'provisional|Model default, not entered'), JSON.stringify(s0));
  const calc = await p.evaluate(() => { const a = bkAfterTaxV18(), r = bkLoad(); return { at: a.atIRR, mo: a.atMOIC, sale: a.saleTax, rec: a.recaptureTax, cg: a.capGainTax, acc: a.accumDepr, rates: [r.taxRate, r.depRecaptureRate, r.capGainsRate] }; });
  check('the engine still runs on its defaults (37%, 25%, 20%) and saves them as before: nothing is blocked', calc.rates.join() === '0.37,0.25,0.2' && isFinite(calc.at));
  const s1 = await st(p);
  check('a default the engine saved earlier is still the model\'s, not yours: provisional, "saved earlier, not yet confirmed by you"', Object.values(s1).every(v => v === 'provisional|Model default (saved earlier), not yet confirmed by you'), JSON.stringify(s1));
  await patch(p, { taxRate: 0.30 });
  const s2 = await st(p);
  check('a rate that is not the model\'s default can only be the user\'s: confirmed, "Entered by you"; the other two stay provisional', s2.taxRate === 'confirmed|Entered by you' && s2.capGainsRate.startsWith('provisional') && s2.depRecaptureRate.startsWith('provisional'), JSON.stringify(s2));
  await p.evaluate(() => bkTaxRateConfirm('capGainsRate'));
  const s3 = await st(p), after = await p.evaluate(() => ({ r: bkLoad().taxRate, cg: bkLoad().capGainsRate, conf: bkLoad()._taxConfirmed }));
  check('confirming one rate confirms only that rate, keeps its value, and never touches the user\'s own 30%', s3.capGainsRate === 'confirmed|Confirmed by you' && s3.depRecaptureRate.startsWith('provisional') && after.r === 0.3 && after.cg === 0.2 && after.conf.capGainsRate === true && !after.conf.taxRate, JSON.stringify(after));
  check('running the engine overwrites no rate the user entered', await p.evaluate(() => { const before = bkLoad().taxRate; bkAfterTaxV18(); return bkLoad().taxRate === before; }));

  /* ---- no calculation changes ---- */
  const q = await open(A); await patch(q, { taxRate: 0.37, depRecaptureRate: 0.25, capGainsRate: 0.2, _taxConfirmed: { taxRate: true, depRecaptureRate: true, capGainsRate: true } });
  const calc2 = await q.evaluate(() => { const a = bkAfterTaxV18(); return { at: a.atIRR, mo: a.atMOIC, sale: a.saleTax, rec: a.recaptureTax, cg: a.capGainTax, acc: a.accumDepr }; });
  check('the after-tax figures are identical whether the rates are the unconfirmed defaults or the same rates confirmed (no calculation changed)', JSON.stringify([calc.at, calc.mo, calc.sale, calc.rec, calc.cg, calc.acc]) === JSON.stringify([calc2.at, calc2.mo, calc2.sale, calc2.rec, calc2.cg, calc2.acc]), JSON.stringify([calc, calc2]));
  await q.context().close();

  /* ---- Expected: flagged, never blocking, never called a distortion of NOI ---- */
  const p2 = await open(A);
  const ex = await p2.evaluate(() => { const s = bkLoad(), wf = BKReg.workflow('acquisition'), cls = {}; wf.forEach(st => (st.fields || []).forEach(e => { if (['taxRate', 'depRecaptureRate', 'capGainsRate'].includes(e.k)) cls[e.k] = BKReg.requirement(e, s); }));
    const rd = bkDealReadiness(); return { cls, can: rd.canCalculate, state: rd.state, noi: BKReg.expectedMissing(s).map(x => x.key), all: BKReg.expectedMissing(s, true).map(x => x.key + ':' + x.scope), step: wf.find(x => x.id === 'tax') }; });
  check('the three rates are Expected inputs of the acquisition analysis, in a skippable "Tax rates" step', Object.values(ex.cls).join() === 'expected,expected,expected' && ex.step && ex.step.skippable === true, JSON.stringify(ex.cls));
  check('they block nothing: results still show and the state is unchanged', ex.can === true && /READY/.test(ex.state), ex.state);
  check('they are not in the list that overstates NOI (the bar, Home, the readiness chip and the PDF cover do not call a default tax rate a distortion of NOI), but are in the full expected list, marked after-tax', ex.noi.every(k => !/Rate$/.test(k)) && ex.all.filter(x => /aftertax/.test(x)).length === 4, JSON.stringify(ex.all));
  await p2.evaluate(() => showSheet('Home')); await p2.waitForTimeout(700);
  const hm = await p2.evaluate(() => ({ bar: (document.getElementById('bk-kpibar') || {}).innerText || '', chip: bkReadinessChip().replace(/<[^>]+>/g, '') }));
  check('the key-figure bar and the chip say nothing about tax rates being unconfirmed NOI problems', !/tax rate/i.test(hm.bar) && !/EXPECTED INPUTS MISSING/.test(hm.chip), hm.bar.slice(-100));

  /* ---- the Inputs index, the review and the guide ---- */
  const ix = await p2.evaluate(async () => { showSheet('Inputs Index'); await new Promise(r => setTimeout(r, 600)); const t = document.querySelector('#viewport').innerText, rows = ['taxRate', 'depRecaptureRate', 'capGainsRate'].map(k => { const tr = document.querySelector('tr[data-ix-k="' + k + '"]'); return tr ? tr.querySelector('.status-chip').textContent.trim() : null; }); return { rows, txt: t }; });
  check('the Inputs index lists the three as Expected, and says the after-tax figures are provisional (not that NOI is overstated)', ix.rows.join() === 'Expected,Expected,Expected' && /after-tax figures are provisional/.test(ix.txt), ix.rows.join());
  const fd = await p2.evaluate(() => bkDealFindings(bkLoad(), { measure: false }).findings.filter(f => ['taxRate', 'depRecaptureRate', 'capGainsRate'].includes(f.field)).map(f => [f.field, f.tier, f.detail]));
  check('the review has one tier-3 (expected) finding per rate, with its effect', fd.length === 3 && fd.every(f => f[1] === 3 && /not been confirmed/.test(f[2])), JSON.stringify(fd.map(f => f.slice(0, 2))));
  const gd = await p2.evaluate(async () => { bkGuideOn(); bkGuideGo('tax'); await new Promise(r => setTimeout(r, 700)); const t = document.querySelector('.gd').innerText; return { t, fields: [...document.querySelectorAll('[id^="gdf-"]')].map(e => e.id.slice(4)) }; });
  check('the guide has a Tax rates step that asks the three rates, and its "still needed" line speaks of unconfirmed tax rates and provisional figures', ['taxRate', 'depRecaptureRate', 'capGainsRate'].every(k => gd.fields.includes(k)) && /Tax assumptions not confirmed/.test(gd.t) && /provisional/.test(gd.t), gd.t.slice(0, 160));
  await p2.evaluate(() => bkGuideOff());

  /* ---- the pages and the PDF say so, and say it depends on the investor ---- */
  const at = await p2.evaluate(async () => { showSheet('After-Tax'); await new Promise(r => setTimeout(r, 700)); const t = document.querySelector('#viewport').innerText; return { t, chips: [...document.querySelectorAll('#viewport .status-chip')].map(c => c.textContent.trim()).filter(x => /Provisional|Confirmed/.test(x)) }; });
  check('the After-Tax page opens with a provisional banner and a panel naming each rate\'s source, what it affects and a Confirm button', /After-tax figures are provisional/.test(at.t) && /Tax assumptions: where they come from/.test(at.t) && at.chips.filter(c => c === 'Provisional').length === 4 && /Applied each year to taxable operating income/.test(at.t) && /unrecaptured Section 1250/.test(at.t) && /remaining long-term gain/.test(at.t), at.chips.join());
  check('and it never presents them as universally applicable: it says rates depend on the investor\'s circumstances, the jurisdiction, the ownership structure and the transaction', /depend on the investor's circumstances, the jurisdiction, the ownership structure and the transaction/.test(at.t) && /not tax advice/.test(at.t));
  const rp = await p2.evaluate(async () => { showSheet('After-Tax Report'); await new Promise(r => setTimeout(r, 700)); return /After-tax figures are provisional/.test(document.querySelector('#viewport').innerText); });
  const pdf = await p2.evaluate(() => { const h = bkReportHTML(); return /Provisional tax assumptions/.test(h) && /not figures confirmed for this investor/.test(h) && /depend on the investor/.test(h); });
  check('the After-Tax Report and the investor PDF\'s after-tax page carry the same provisional label', rp && pdf, JSON.stringify([rp, pdf]));
  await p2.evaluate(() => { showSheet('After-Tax'); });
  await p2.waitForTimeout(500);
  await p2.evaluate(() => bkTaxRateConfirm());
  await p2.waitForTimeout(700);
  const done = await p2.evaluate(async () => { const t = document.querySelector('#viewport').innerText; const h = bkReportHTML(); showSheet('After-Tax Report'); await new Promise(r => setTimeout(r, 500)); return { page: !/After-tax figures are provisional/.test(t), chips: [...document.querySelectorAll('#viewport .status-chip')].filter(c => /Provisional/.test(c.textContent)).length, pdf: !/Provisional tax assumptions/.test(h), rp: !/After-tax figures are provisional/.test(document.querySelector('#viewport').innerText), exp: BKReg.expectedMissing(bkLoad(), true).length, st: bkLoad()._taxConfirmed }; });
  check('after "Confirm these rates as mine" every label is gone, the three are no longer expected-missing, and the confirmation is saved with the deal', done.page && done.chips === 0 && done.pdf && done.rp && done.exp === 0 && done.st.taxRate && done.st.depRecaptureRate && done.st.capGainsRate, JSON.stringify(done));
  await p2.waitForTimeout(1500);
  check('the confirmation is stored with the deal (it is in the saved record, so it survives a reload and a sync)', await p2.evaluate(() => { const raw = JSON.parse(localStorage.getItem('bkcapital.cre.v02') || '{}'); return !!(raw._taxConfirmed && raw._taxConfirmed.taxRate && raw._taxConfirmed.depRecaptureRate && raw._taxConfirmed.capGainsRate); }));
  check('no page errors', p.errs.length === 0 && p2.errs.length === 0, p.errs.concat(p2.errs).join('|'));
  console.log('tax defaults: ' + checks + ' checks, ' + fails + ' failures'); await b.close(); process.exit(fails ? 1 : 0);
})();
