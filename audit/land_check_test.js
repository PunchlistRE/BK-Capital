// Land allocation check (owner-approved, November 2026). Land is generally not depreciable; an allocation of 0% depreciates the whole purchase price. The Model Check dep.land-zero asks for the allocation in effect to be
// reviewed, explains the tax and return implications, lets a legitimate treatment (leasehold or ground lease, land owned or leased separately, another) be selected and explained instead of forcing a percentage, and sets
// NO minimum. It changes no calculation and overwrites no allocation.
//   node audit/land_check_test.js index.html
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); const path = require('path');
const A = require(path.join(__dirname, 'deal.js')), D = require(path.join(__dirname, 'devdeal.js'));
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  let checks = 0, fails = 0; const check = (n, ok, d) => { checks++; if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? '  [' + String(d).slice(0, 500) + ']' : '')); };
  const open = async (deal) => { const ctx = await b.newContext({ viewport: { width: 1300, height: 1000 } }), p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
    await p.route(/supabase\.co|vercel\.app|fonts\.g|cdn\.jsdelivr|newyorkfed/, r => r.abort()); await p.goto('file://' + path.resolve(process.argv[2])); await p.waitForTimeout(700);
    await p.evaluate((d) => { document.documentElement.classList.add('bk-auth-ok'); bkCreateNewDeal(d); }, deal); return p; };
  const patch = (p, x) => p.evaluate((x) => { const s = bkLoad(); Object.assign(s, x); bkSave(s); }, x);
  const rule = (p) => p.evaluate(() => { const c = bkConflicts().find(x => x.id === 'dep.land-zero'); return c ? { level: c.level, msg: c.message, why: c.why } : null; });
  const p = await open(A);

  /* ---- what is in effect today ---- */
  const base = await p.evaluate(() => { const a = bkLandAllocation(bkLoad()); return a; });
  check('the allocation in effect is what the after-tax engine used (here its default schedule: 20% of the basis), and the model says it is a default, not an allocation entered', base && Math.abs(base.pct - 0.2) < 1e-9 && base.isDefault === true && /after-tax default schedule/.test(base.path), JSON.stringify(base));
  check('with that allocation the check is quiet (0% is the only case it asks about, and it sets no minimum)', (await rule(p)) === null);

  /* ---- 0% in effect ---- */
  await patch(p, { landValuePct: 0 });
  const z = await rule(p), za = await p.evaluate(() => bkLandAllocation(bkLoad()));
  check('a 0% land allocation in effect raises the check (WARN) and names the whole depreciable amount', z && z.level === 'WARN' && za.land === 0 && /Land is allocated 0% of the purchase price: the whole \$[\d,]+ is depreciable/.test(z.msg), JSON.stringify(z && z.msg));
  const il = await p.evaluate(() => { const cur = bkRunWith({}, () => bkAfterTaxV18().atIRR), ten = bkRunWith({ landValuePct: 0.1 }, () => bkAfterTaxV18().atIRR); return { cur, ten }; });
  const pc = (v) => (v * 100).toFixed(2) + '%';
  check('it explains why (land is generally not depreciable) and what it distorts: depreciation, taxable income, recapture, after-tax cash flow, after-tax proceeds, after-tax IRR and NPV', /generally not depreciable/.test(z.why) && ['depreciation deductions', 'taxable income', 'depreciation recapture', 'after-tax cash flow', 'after-tax proceeds', 'after-tax IRR and NPV'].every(w => z.why.includes(w)), z.why.slice(0, 200));
  check('it quantifies the effect as an illustration only, against an independent re-run (10% as land): the IRRs it quotes are the engine\'s, and it says 10% is not a recommendation', z.why.includes('instead of ' + pc(il.cur)) && z.why.includes('would be ' + pc(il.ten)) && /not a recommended allocation/.test(z.why), z.why.match(/Illustration only.*?\./) && z.why.match(/Illustration only.*?\./)[0]);
  check('it asks for confirmation or correction, names the legitimate exceptions, and says the model sets no minimum (a defensible valuation and the applicable tax treatment decide)', /Confirm or correct it on the Depreciation page/.test(z.why) && /leasehold or ground lease, land owned or leased separately/.test(z.why) && /sets no minimum/.test(z.why) && /defensible valuation/.test(z.why));

  /* ---- exceptions are documented, not forced ---- */
  const before = await p.evaluate(() => ({ lv: bkLoad().landValuePct, dep: JSON.stringify(bkLoad()._depr || null) }));
  const T = await p.evaluate(() => bkLandReview ? window.BK_LAND_TREATMENTS : []);
  check('the treatments are: reviewed and 0% is correct, leasehold or ground lease, land owned or leased separately, other', T.join('|') === 'Reviewed: 0% land is correct for this deal|Leasehold or ground lease|Land owned or leased separately|Other treatment', T.join('|'));
  await patch(p, { landReviewTreatment: 'Leasehold or ground lease', landReviewNote: '' });
  const noNote = await rule(p);
  check('a treatment chosen without an explanation still raises the check, and says so', noNote && /treatment chosen \(Leasehold or ground lease\) has no explanation/.test(noNote.msg), noNote && noNote.msg);
  await patch(p, { landReviewTreatment: '', landReviewNote: 'only a note' });
  check('an explanation with no treatment selected is not enough', (await rule(p)) !== null);
  const calcBefore = await p.evaluate(() => { const a = bkAfterTaxV18(); return JSON.stringify([a.atIRR, a.atMOIC, a.saleTax, a.accumDepr, a.deprBasis]); });
  for (const t of T) {
    await patch(p, { landReviewTreatment: t, landReviewNote: '99-year ground lease; land is leased, so no land basis is owned' });
    check('"' + t + '" with an explanation is a documented treatment: the check is quiet', (await rule(p)) === null);
  }
  const calcAfter = await p.evaluate(() => { const a = bkAfterTaxV18(); return JSON.stringify([a.atIRR, a.atMOIC, a.saleTax, a.accumDepr, a.deprBasis]); });
  const after = await p.evaluate(() => ({ lv: bkLoad().landValuePct, dep: JSON.stringify(bkLoad()._depr || null) }));
  check('documenting a treatment changes no calculation and overwrites no allocation (the after-tax figures and the 0% are untouched)', calcBefore === calcAfter && before.lv === after.lv && before.dep === after.dep && after.lv === 0, JSON.stringify([before.lv, after.lv]));

  /* ---- no minimum, and only where it applies ---- */
  await patch(p, { landReviewTreatment: '', landReviewNote: '', landValuePct: 0.01 });
  check('a 1% allocation is not flagged: the check asks about 0% only and imposes no minimum percentage', (await rule(p)) === null);
  await patch(p, { landValuePct: 0.35 });
  check('any entered allocation is accepted as it is (35%)', (await rule(p)) === null);
  await patch(p, { landValuePct: 0, propertyType: 'Land' });
  check('a land purchase is not an applicable acquisition of depreciable real property', (await rule(p)) === null);
  await patch(p, { propertyType: A.propertyType, landValuePct: 0, purchasePrice: 0 });
  check('with no purchase price there is nothing to allocate', (await rule(p)) === null);
  await patch(p, { purchasePrice: A.purchasePrice });

  /* ---- a depreciation schedule configured on the Depreciation page with land at 0 ---- */
  await patch(p, { landValuePct: 0.2 });
  await p.evaluate(() => { bkDeprSet('costSeg', true); bkDeprSet('landMethod', 'percent'); bkDeprSet('landPct', 0); });
  const cs = await rule(p);
  check('a cost-segregation schedule configured with 0% land is flagged too, whichever path feeds the returns', cs && /whole \$[\d,]+ is depreciable/.test(cs.msg) && /Depreciation page/.test(cs.why), cs && cs.msg);
  await p.evaluate(() => { bkDeprSet('landPct', 0.2); });
  check('and clears when the allocation is entered', (await rule(p)) === null);

  /* ---- the page, the review and the lens ---- */
  await p.evaluate(() => { const s = bkLoad(); delete s._depr; s.landValuePct = 0; s.landReviewTreatment = ''; s.landReviewNote = ''; bkSave(s); });
  await p.evaluate(() => showSheet('Depreciation')); await p.waitForTimeout(800);
  const pg = await p.evaluate(() => { const t = document.querySelector('#viewport').innerText; return { t, sel: !!document.querySelector('#viewport select[onchange*="landReviewTreatment"]'), note: !!document.querySelector('#viewport input[onchange*="landReviewNote"]') }; });
  check('the Depreciation page shows the allocation in effect, its source, a treatment selector and an explanation box, and says no percentage is set by the model', /Land allocation: review/.test(pg.t) && /Allocation in effect/.test(pg.t) && /\(0\.0{1,2}%\)/.test(pg.t) && pg.sel && pg.note && /does not set a land percentage/.test(pg.t), pg.t.slice(0, 120));
  const f = await p.evaluate(() => { const q = bkDealFindings(bkLoad(), { measure: false }).findings.filter(x => /dep\.land-zero/.test(x.rule)); const lens = bkLens('tax').rows.find(r => r.label === 'Depreciable basis'); return { n: q.length, tier: q[0] && q[0].tier, group: q[0] && q[0].group, lens: lens && lens.status, lr: lens && lens.rules }; });
  check('the review lists it once (a tax finding, Model Check warning tier) and the tax lens flags the depreciable basis row from the same rule', f.n === 1 && f.tier === 4 && f.group === 'Tax' && f.lens === 'look' && f.lr.includes('dep.land-zero'), JSON.stringify(f));

  /* ---- a development deal ---- */
  const pd = await open(D); await patch(pd, { landValuePct: 0 });
  check('a development deal (land is a separate purchase) is not asked', (await rule(pd)) === null);
  check('no page errors', p.errs.length === 0 && pd.errs.length === 0, p.errs.concat(pd.errs).join('|'));
  console.log('land check: ' + checks + ' checks, ' + fails + ' failures'); await b.close(); process.exit(fails ? 1 : 0);
})();
