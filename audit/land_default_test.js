// Land-allocation default (owner-approved, November 2026), treated exactly like the tax-rate defaults. The after-tax engine silently saves a 20% land share when none is entered and the default after-tax figures use it.
// It is now an Expected input: labelled the model's default, unconfirmed until the user confirms it, explained (land is generally not depreciable; it sets the depreciable basis and the after-tax returns), the after-tax
// figures provisional meanwhile. No calculation changes and no entered allocation is overwritten.
//   node audit/land_default_test.js index.html
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); const path = require('path');
const A = require(path.join(__dirname, 'deal.js'));
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  let checks = 0, fails = 0; const check = (n, ok, d) => { checks++; if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? '  [' + String(d).slice(0, 500) + ']' : '')); };
  const open = async (deal) => { const ctx = await b.newContext({ viewport: { width: 1300, height: 1000 } }), p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
    await p.route(/supabase\.co|vercel\.app|fonts\.g|cdn\.jsdelivr|newyorkfed/, r => r.abort()); await p.goto('file://' + path.resolve(process.argv[2])); await p.waitForTimeout(700);
    await p.evaluate((d) => { document.documentElement.classList.add('bk-auth-ok'); bkCreateNewDeal(d); }, deal); return p; };
  const patch = (p, x) => p.evaluate((x) => { const s = bkLoad(); Object.assign(s, x); bkSave(s); }, x);
  const st = (p) => p.evaluate(() => { const t = bkTaxRateStatus('landValuePct'); return t.state + '|' + t.source; });
  const p = await open(A);

  /* ---- where the land share stands ---- */
  check('with no allocation entered the 20% land share is provisional: "Model default, not entered"', (await st(p)) === 'provisional|Model default, not entered');
  const calc = await p.evaluate(() => { const a = bkAfterTaxV18(); return { v: [a.atIRR, a.atMOIC, a.saleTax, a.accumDepr, a.deprBasis, a.landValue], saved: bkLoad().landValuePct }; });
  check('the engine still runs on its 20% default and saves it as before: nothing is blocked', calc.saved === 0.2 && isFinite(calc.v[0]) && Math.abs(calc.v[5] / (calc.v[4] + calc.v[5]) - 0.2) < 1e-9);
  check('the share the engine saved is still the model\'s, not the user\'s: "saved earlier, not yet confirmed by you"', (await st(p)) === 'provisional|Model default (saved earlier), not yet confirmed by you');
  const inEff = await p.evaluate(() => bkLandDefaultInEffect(bkLoad()));
  check('it matters while the default after-tax schedule is what the figures use', inEff === true);

  /* ---- Expected, scoped to the after-tax figures ---- */
  const ex = await p.evaluate(() => { const s = bkLoad(), wf = BKReg.workflow('acquisition'), tax = wf.find(x => x.id === 'tax'), e = tax.fields.find(f => f.k === 'landValuePct'); return { cls: BKReg.requirement(e, s), step: tax.title, all: BKReg.expectedMissing(s, true).map(x => x.key + ':' + x.scope), noi: BKReg.expectedMissing(s).map(x => x.key), eff: (BKReg.expectedMissing(s, true).find(x => x.key === 'landValuePct') || {}).effect }; });
  check('the land allocation is an Expected input of the Tax assumptions step, scoped to the after-tax figures (not a distortion of NOI)', ex.cls === 'expected' && ex.step === 'Tax assumptions' && ex.all.includes('landValuePct:aftertax') && !ex.noi.includes('landValuePct'), JSON.stringify(ex.all));
  check('its effect says it is the model\'s default, unconfirmed, that land is generally not depreciable, and that it sets the depreciable basis', /default \(20% of the basis as land\)/.test(ex.eff) && /generally not depreciable/.test(ex.eff) && /depreciable basis/.test(ex.eff) && /not been confirmed/.test(ex.eff), ex.eff);
  const rd = await p.evaluate(() => ({ can: bkDealReadiness().canCalculate, state: bkDealReadiness().state }));
  check('it blocks nothing: results show and the state is unchanged', rd.can === true && /READY/.test(rd.state));

  /* ---- the pages, the review, the guide, the PDF ---- */
  const at = await p.evaluate(async () => { showSheet('After-Tax'); await new Promise(r => setTimeout(r, 700)); const t = document.querySelector('#viewport').innerText; return { t, chips: [...document.querySelectorAll('#viewport .status-chip')].map(c => c.textContent.trim()).filter(x => /Provisional|Confirmed/.test(x)) }; });
  check('the After-Tax page lists the land allocation with the three rates: its source, what it affects (land is generally not depreciable; depreciable basis; after-tax cash flow and IRR), the support it needs, and a Confirm button', at.chips.filter(c => c === 'Provisional').length === 4 && /Land allocation/.test(at.t) && /Land is generally not depreciable/.test(at.t) && /depreciable basis/.test(at.t) && /appraisal, the assessor/.test(at.t) && /Tax rates and the land allocation depend on the investor/.test(at.t), at.chips.join());
  const dp = await p.evaluate(async () => { showSheet('Depreciation'); await new Promise(r => setTimeout(r, 800)); const t = document.querySelector('#viewport').innerText; return { t, btn: !!document.querySelector('#viewport button[onclick*="bkTaxRateConfirm(\'landValuePct\')"]') }; });
  check('the Depreciation page says the allocation in effect is the model\'s default, not confirmed by you, with a button to confirm it', /the model's default, not confirmed by you/.test(dp.t) && dp.btn, dp.t.match(/Allocation in effect[^]{0,140}/)[0].replace(/\n/g, ' '));
  const fd = await p.evaluate(() => bkDealFindings(bkLoad(), { measure: false }).findings.filter(f => f.field === 'landValuePct').map(f => [f.tier, f.detail]));
  const ln = await p.evaluate(() => { const r = bkLens('tax').rows.find(x => x.label === 'Depreciable basis'); return { st: r.status, m: r.messages.join(' '), why: r.why }; });
  check('the review has one tier-3 finding for it, and the tax lens flags the depreciable-basis row as the model\'s default, with the caution that it depends on the investor and the property', fd.length === 1 && fd[0][0] === 3 && ln.st === 'look' && /land allocation \(20% of the basis\) is the model's default, not confirmed by you/.test(ln.m) && /depend on the investor/.test(ln.why), JSON.stringify([fd, ln.st]));
  const pdf = await p.evaluate(() => { const h = bkReportHTML(); const i = h.indexOf('Provisional tax assumptions'); return i > -1 && /land allocation \(20(\.0+)?%\)/.test(h.slice(i, i + 700)); });
  check('the investor PDF\'s after-tax page names the land allocation among the provisional assumptions', pdf);
  const gd = await p.evaluate(async () => { bkGuideOn(); bkGuideGo('tax'); await new Promise(r => setTimeout(r, 700)); return { f: [...document.querySelectorAll('[id^="gdf-"]')].map(e => e.id.slice(4)), t: document.querySelector('.gd').innerText }; });
  check('the guide\'s Tax assumptions step asks the land allocation with the rates, and says they are not confirmed', gd.f.includes('landValuePct') && /Tax assumptions not confirmed/.test(gd.t) && /land allocation/.test(gd.t));
  await p.evaluate(() => bkGuideOff());

  /* ---- confirming, and never overwriting ---- */
  await p.evaluate(() => bkTaxRateConfirm('landValuePct'));
  const cf = await p.evaluate(() => ({ s: bkTaxRateStatus('landValuePct').state + '|' + bkTaxRateStatus('landValuePct').source, v: bkLoad().landValuePct, c: bkLoad()._taxConfirmed, still: bkTaxRatesProvisional(bkLoad()) }));
  check('confirming keeps the 20%, marks it "Confirmed by you", stores the confirmation, and leaves the three rates as they were', cf.s === 'confirmed|Confirmed by you' && cf.v === 0.2 && cf.c.landValuePct === true && !cf.c.taxRate && cf.still.join() === 'taxRate,depRecaptureRate,capGainsRate', JSON.stringify(cf));
  const calc2 = await p.evaluate(() => { const a = bkAfterTaxV18(); return [a.atIRR, a.atMOIC, a.saleTax, a.accumDepr, a.deprBasis, a.landValue]; });
  check('the after-tax figures are identical provisional or confirmed (no calculation changed)', JSON.stringify(calc.v) === JSON.stringify(calc2));
  await p.context().close();

  const q = await open(A); await patch(q, { landValuePct: 0.35 });
  check('an allocation the user entered (35%) is theirs: confirmed, "Entered by you", never overwritten by running the engine', (await st(q)) === 'confirmed|Entered by you' && await q.evaluate(() => { bkAfterTaxV18(); return bkLoad().landValuePct === 0.35; }));
  await patch(q, { landValuePct: 0 });
  check('a 0% allocation is not the default, so it is the user\'s (the land check, not this flag, asks about it)', (await st(q)) === 'confirmed|Entered by you');
  await q.context().close();

  /* ---- the Depreciation page's own land setting takes over: the default no longer applies ---- */
  const r2 = await open(A); await r2.evaluate(() => { bkDeprSet('landMethod', 'percent'); bkDeprSet('landPct', 0.15); });
  const dd = await r2.evaluate(() => { const s = bkLoad(), tax = BKReg.workflow('acquisition').find(x => x.id === 'tax'), e = tax.fields.find(f => f.k === 'landValuePct'); return { inEff: bkLandDefaultInEffect(s), cls: BKReg.requirement(e, s), prov: bkTaxRatesProvisional(s).includes('landValuePct'), path: bkLandAllocation(s).path }; });
  check('once the Depreciation page\'s own land setting feeds the figures, the legacy 20% is not in effect: not applicable, not flagged', dd.inEff === false && dd.cls === 'na' && dd.prov === false && /Depreciation page/.test(dd.path), JSON.stringify(dd));
  check('no page errors', r2.errs.length === 0, r2.errs.join('|'));
  console.log('land default: ' + checks + ' checks, ' + fails + ' failures'); await b.close(); process.exit(fails ? 1 : 0);
})();
