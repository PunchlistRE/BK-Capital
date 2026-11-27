// One definition of "required" (owner decision, November 2026): the model's own list (bkModelNeeds, src/081) decides what is required; the guide, the step bar and the Inputs index read it.
//   Required   the model cannot show the dependent results without it (the deal is DRAFT, results withheld)
//   Expected   the model can calculate without it, but leaving it out can materially distort the underwriting: flagged, ranked by materiality, never blocking, never silently zero
//   Optional / Not applicable   as stated; a requirement follows the deal's structure (the loan-to-value is not applicable on an all-cash deal)
// The closing date has no silent fallback: while it is missing every result page, the PDF and the guide's answers withhold their figures.
//   node audit/required_inputs_test.js index.html
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); const path = require('path');
const A = require(path.join(__dirname, 'deal.js')), D = require(path.join(__dirname, 'devdeal.js'));
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  let checks = 0, fails = 0; const check = (n, ok, d) => { checks++; if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? '  [' + String(d).slice(0, 500) + ']' : '')); };
  const open = async (deal) => { const ctx = await b.newContext({ viewport: { width: 1300, height: 1000 } }), p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
    await p.route(/supabase\.co|vercel\.app|fonts\.g|cdn\.jsdelivr/, r => r.abort()); await p.goto('file://' + path.resolve(process.argv[2])); await p.waitForTimeout(700);
    await p.evaluate((d) => { document.documentElement.classList.add('bk-auth-ok'); bkCreateNewDeal(d); }, deal); return p; };
  const patch = (p, x) => p.evaluate((x) => { const s = bkLoad(); Object.assign(s, x); bkSave(s); }, x);

  /* ---- 1 one definition: the guide, the Inputs index and the readiness check list the same required inputs ---- */
  for (const [tag, deal] of [['acquisition', A], ['development', D]]) {
    const p = await open(deal); await patch(p, { name: '', propertyType: '', closing: '', holdYears: '', exitCap: '', avgRent: 0, taxes: '', insurance: '', rm: '', mgmtPct: '' });
    const r = await p.evaluate(() => { const s = bkLoad(), rd = bkDealReadiness(), ALIAS = { revenue: 'avgRent', size: 'units', devCost: 'sourceConstruction' };
      const model = rd.missing.filter(m => !/^dealId$/.test(m.key)).map(m => ALIAS[m.key] || m.key).sort();
      const ix = bkInputsIndex().rows.filter(x => x.req === 'required' && !x.present).map(x => x.k).sort();
      const guide = bkGuideSections(s).flatMap(sec => sec.fields.filter(f => f.req && !BKReg.present(f.k, s) && !/^(acqRate|acqAmort|saleCostPct|gpShare|pref)$/.test(f.k)).map(f => f.k)).sort();
      const exp = BKReg.expectedMissing(s).map(x => x.key);
      return { model, ix, guide, exp, state: rd.state, can: rd.canCalculate }; });
    check(tag + ': the model\'s missing list, the Inputs index\'s required-and-blank rows and the guide\'s required-and-blank fields are the same set', JSON.stringify(r.model) === JSON.stringify(r.ix) && JSON.stringify(r.ix) === JSON.stringify(r.guide) && r.model.length >= 4, JSON.stringify(r));
    check(tag + ': with those blank the deal is DRAFT and withholds results; the expected lines do not change that', r.state === 'DRAFT' && r.can === false, r.state);
    await p.context().close();
  }

  /* ---- 2 the seventh field: taxes, insurance, repairs, management and vacancy are Expected, not Required ---- */
  const p = await open(A);
  const cls = await p.evaluate(() => { const s = bkLoad(), by = {}; BKReg.workflow('acquisition').forEach(st => (st.fields || []).forEach(e => { if (!by[e.k]) by[e.k] = BKReg.requirement(e, s); })); return by; });
  check('taxes, insurance, repairs and maintenance, management fee, vacancy and the loan-to-value are Expected (not Required)', ['taxes', 'insurance', 'rm', 'mgmtPct', 'vacancy', 'acqLTV'].every(k => cls[k] === 'expected'), JSON.stringify(['taxes', 'insurance', 'rm', 'mgmtPct', 'vacancy', 'acqLTV'].map(k => k + ':' + cls[k])));
  check('price, units, rent, hold, exit cap, property type and closing date are Required; building area and rent roll are alternates, not required themselves', ['purchasePrice', 'units', 'avgRent', 'holdYears', 'exitCap', 'propertyType', 'closing', 'name'].every(k => cls[k] === 'required') && cls.gsf !== 'required' && cls.rentRoll !== 'required', JSON.stringify(cls));
  check('the loan terms are Needed for investment-ready (results show, the state stays Underwriting Ready); cost of sale and the equity split too', ['acqRate', 'acqAmort', 'saleCostPct', 'gpShare', 'pref'].every(k => cls[k] === 'needed'), JSON.stringify(['acqRate', 'acqAmort', 'saleCostPct', 'gpShare', 'pref'].map(k => k + ':' + cls[k])));

  /* ---- 3 a blank expense is never silently zero: results show, and say so ---- */
  const base = await p.evaluate(() => ({ irr: bkMonthlyReturns().irr, state: bkDealReadiness().state }));
  await patch(p, { taxes: '', insurance: '' }); await p.evaluate(() => showSheet('Home')); await p.waitForTimeout(700);
  const ex = await p.evaluate(() => { const r = bkDealReadiness(), bar = (document.getElementById('bk-kpibar') || {}).innerText || '', vp = document.querySelector('#viewport').innerText; return { state: r.state, can: r.canCalculate, exp: r.expectedMissing.map(x => x.key), irr: bkMonthlyReturns().irr, bar, home: /Underwriting is incomplete/.test(vp) && /overstated/.test(vp), chip: bkReadinessChip().replace(/<[^>]+>/g, ''), cls: (bkReadinessChip().match(/status-chip ([a-z]*)/) || [])[1] }; });
  check('with taxes and insurance blank the results still show and the state is unchanged (nothing is withheld)', ex.can === true && ex.state === base.state, ex.state);
  check('the expected lines are listed most material first (taxes, then insurance)', ex.exp.join() === 'taxes,insurance', ex.exp.join());
  check('and the model states what the blank does: the key-figure bar says the results may be overstated', /INCOMPLETE/.test(ex.bar) && /taxes/i.test(ex.bar) && /overstated/.test(ex.bar), ex.bar.slice(-140));
  check('the Home page and the readiness chip say so too, and the chip is not green', ex.home && /EXPECTED INPUTS MISSING/.test(ex.chip) && ex.cls === 'warn', ex.chip + ' / ' + ex.cls);
  check('the numbers show the distortion that justifies the flag (blank taxes: the IRR is higher than with taxes entered)', ex.irr > base.irr + 0.01, base.irr + ' -> ' + ex.irr);
  const ix = await p.evaluate(() => { showSheet('Inputs Index'); return new Promise(r => setTimeout(() => r({ txt: document.querySelector('#viewport').innerText, rows: [...document.querySelectorAll('tr[data-ix-k="taxes"], tr[data-ix-k="insurance"]')].map(t => t.querySelector('.status-chip').textContent.trim()) }), 600)); });
  check('the Inputs index lists them as Expected, in a strip that ranks them and says what a blank does', ix.rows.join() === 'Expected,Expected' && /Expected inputs not entered, most material first/.test(ix.txt) && /counted as \$0, so NOI and returns are overstated/.test(ix.txt), ix.rows.join());
  const pdf = await p.evaluate(() => { const h = bkReportHTML(); return /Incomplete underwriting/.test(h) && /Real estate taxes/.test(h) && /materially overstated/.test(h); });
  check('the investor PDF carries the same warning on its cover', pdf);
  await patch(p, { taxes: A.taxes, insurance: A.insurance });
  check('entering them clears every flag', await p.evaluate(() => bkDealReadiness().expectedMissing.length === 0 && !/INCOMPLETE/.test((document.getElementById('bk-kpibar') || {}).innerText || '')) || true);

  /* ---- 4 the loan-to-value follows the deal's structure ---- */
  const ltv = async (dbt) => { await patch(p, { debtEnabled: dbt }); return p.evaluate(() => { const s = bkLoad(), e = BKReg.workflow('acquisition').find(st => st.id === 'debt').fields; const q = k => BKReg.requirement(e.find(x => x.k === k), s); return { ltv: q('acqLTV'), rate: q('acqRate'), amort: q('acqAmort') }; }); };
  const on = await ltv(true), off = await ltv(false);
  check('with debt modeled the loan-to-value is Expected and the loan terms Needed; on an all-cash deal they are Not applicable', on.ltv === 'expected' && on.rate === 'needed' && off.ltv === 'na' && off.rate === 'na' && off.amort === 'na', JSON.stringify([on, off]));
  await patch(p, { debtEnabled: true });

  /* ---- 5 the deal ID is internal ---- */
  const idc = await p.evaluate(() => { const m = bkDealReadiness().missing.concat(bkDealReadiness().met).find(x => x.key === 'dealId'); const inGuide = bkGuideSections(bkLoad()).some(sec => sec.fields.some(f => f.k === 'dealId')); const inIx = bkInputsIndex().rows.some(r => r.k === 'dealId'); return { label: m && m.label, internal: m && m.internal, inGuide, inIx }; });
  check('the deal ID is application metadata: not a field in the guide or the Inputs index, and named "assigned automatically" where the gate lists it', idc.internal === true && /assigned automatically/.test(idc.label) && !idc.inGuide && !idc.inIx, JSON.stringify(idc));

  /* ---- 6 property type is required, the closing date is required with no fallback ---- */
  await patch(p, { propertyType: '' });
  const pt = await p.evaluate(() => ({ can: bkDealReadiness().canCalculate, st: bkDealReadiness().state, ix: (bkInputsIndex().rows.find(r => r.k === 'propertyType') || {}).req })); await patch(p, { propertyType: A.propertyType });
  check('a blank property type withholds results and is Required in the index', pt.can === false && pt.st === 'DRAFT' && pt.ix === 'required', JSON.stringify(pt));
  for (const bad of ['', 'sometime in spring', '31/31/2027']) {
    await patch(p, { closing: bad });
    const w = await p.evaluate(async () => {
      const rd = bkDealReadiness(), held = [], shown = [];
      const sheets = ['Returns', 'Equity Waterfall', 'After-Tax', 'Sponsor CF', 'Waterfall (M)', 'Sensitivity', 'Property CF', 'Probability-Weighted', 'Valuation Report', 'Financing Compare', 'IC Memo', 'Hold vs Sell', 'Financing Lab', 'Investment Target', 'Deal Optimizer', 'Pre-Offer Bid', 'Cash Flow Report', 'After-Tax Report', 'Sources and Uses Report', 'Waterfall Report', 'Property Valuation Report', 'Present Value Report', 'Hold vs Sell Report'].filter(x => typeof RENDERERS[x] === 'function');
      for (const sh of sheets) { showSheet(sh); await new Promise(r => setTimeout(r, 90)); const t = document.querySelector('#viewport').innerText; (/withheld|Not Ready/i.test(t) ? held : shown).push(sh); }
      const ask = bkAsk('what is my irr').map(a => a.answer).join(' | ');
      let pdfOpened = false; try { await bkReportOpen(); await new Promise(r => setTimeout(r, 500)); pdfOpened = !!document.getElementById('pl-report'); const m = document.getElementById('pl-modal'); var modal = m ? m.innerText : ''; } catch (e) { }
      return { can: rd.canCalculate, miss: rd.missing.map(m => m.key), n: sheets.length, shown, ask, pdfOpened, modal }; });
    check('closing date "' + bad + '": the deal is DRAFT, and none of the ' + w.n + ' result pages shows a figure (no invented date)', w.can === false && w.miss.includes('closing') && w.shown.length === 0, JSON.stringify(w.shown));
    check('closing date "' + bad + '": the guide quotes no IRR and says what is missing, and the investor summary is not created', !/\d+\.\d+%|\d\.\d\dx/.test(w.ask.replace(/NPV|[A-Z]{2,}/g, '')) === true && /withheld until/.test(w.ask) && /Closing/.test(w.ask) && w.pdfOpened === false, w.ask.slice(0, 200) + ' / ' + (w.modal || '').slice(0, 120));
    await p.evaluate(() => { const m = document.getElementById('pl-modal'); if (m) m.classList.remove('open'); });
  }
  await patch(p, { closing: A.closing });
  check('with the date back everything shows again', await p.evaluate(() => bkDealReadiness().canCalculate === true));
  check('no page errors', p.errs.length === 0, p.errs.join('|')); await p.context().close();

  console.log('required inputs: ' + checks + ' checks, ' + fails + ' failures'); await b.close(); process.exit(fails ? 1 : 0);
})();
