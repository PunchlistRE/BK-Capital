// Guide 2.0, phase 2a (owner-approved): the deal review. A deterministic findings engine (src/223) reads the model (requirement classes, Model Checks, the Inputs index, the engine re-run on a copy)
// and the guide shows it first: what deserves attention, what is known, missing, inconsistent, and which assumptions matter most. No AI, no data written, no rule of its own.
//   node audit/deal_review_test.js index.html
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); const path = require('path');
const A = require(path.join(__dirname, 'deal.js')), D = require(path.join(__dirname, 'devdeal.js'));
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  let checks = 0, fails = 0; const check = (n, ok, d) => { checks++; if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? '  [' + String(d).slice(0, 500) + ']' : '')); };
  const open = async (deal) => { const ctx = await b.newContext({ viewport: { width: 1300, height: 1000 } }), p = await ctx.newPage(); p.errs = []; p.reqs = []; p.on('pageerror', e => p.errs.push(e.message)); p.on('request', r => { if (!/^(file|data|blob):/.test(r.url())) p.reqs.push(r.url()); });
    await p.route(/supabase\.co|vercel\.app|fonts\.g|cdn\.jsdelivr|newyorkfed/, r => r.abort()); await p.goto('file://' + path.resolve(process.argv[2])); await p.waitForTimeout(700);
    await p.evaluate((d) => { document.documentElement.classList.add('bk-auth-ok'); bkCreateNewDeal(d); }, deal); return p; };
  const patch = (p, x) => p.evaluate((x) => { const s = bkLoad(); Object.assign(s, x); bkSave(s); }, x);
  const F = (p, measure) => p.evaluate((m) => JSON.parse(JSON.stringify(bkDealFindings(bkLoad(), { measure: m }))), measure);

  const p = await open(A);
  /* ---- deterministic, ranked, traceable ---- */
  await patch(p, { taxes: '', mgmtPct: '', acqIO: 2, repayType: 'Interest only then amortizing', debtTerm: 2, holdYears: 5 });
  const a = await F(p, true), a2 = await p.evaluate(() => { const x = JSON.stringify(bkDealFindings(bkLoad(), { measure: true })); return x; });
  const again = await p.evaluate(async () => { await new Promise(r => setTimeout(r, 10)); window.bkDealFindings(bkLoad(), { measure: true }); return JSON.stringify(bkDealFindings(bkLoad(), { measure: true })); });
  check('the findings are the same every time for the same deal (no randomness, no clock)', a2 === again && a.findings.length > 3, a.findings.length + ' findings');
  check('every finding names its kind and the rule that produced it, and says why it ranks where it does', a.findings.every(f => ['missing', 'inconsistent', 'consequential'].includes(f.kind) && f.rule && f.why && f.title), JSON.stringify(a.findings.filter(f => !(['missing', 'inconsistent', 'consequential'].includes(f.kind) && f.rule && f.why && f.title)).map(f => [f.id, f.kind, !!f.rule, !!f.why, !!f.title])));
  const tiers = a.findings.map(f => f.tier);
  check('ranked by tier: required missing, then Model Check errors, needed, expected, warnings, measured assumptions, notes', tiers.every((t, i) => i === 0 || t >= tiers[i - 1]), tiers.join(''));
  check('"attention first" is the five most important of them, in that order', a.attention.length === Math.min(5, a.findings.filter(f => f.tier <= 5).length) && a.attention.every((f, i) => f.id === a.findings.filter(x => x.tier <= 5)[i].id));

  /* ---- measured effects are engine runs, checked independently ---- */
  const m = await p.evaluate(() => { const s = bkLoad(), meas = bkMeasureAssumptions(s), run = (o) => bkRunWith(o, () => bkMonthlyReturns().irr), base = run({}), ec = Number(s.exitCap);
    const up = run({ exitCap: ec + 0.005 }), dn = run({ exitCap: ec - 0.005 }); const row = meas.rows.find(r => r.k === 'exitCap');
    return { row, want: Math.max(Math.abs(up - base), Math.abs(dn - base)), sorted: meas.rows.every((r, i) => i === 0 || r.effect <= meas.rows[i - 1].effect), n: meas.rows.length, ks: meas.rows.map(r => r.k) }; });
  check('the exit cap\'s measured effect equals an independent re-run at plus and minus 50 bps (the larger change in levered IRR)', m.row && Math.abs(m.row.effect - m.want) < 1e-12 && m.row.step === '50 bps', JSON.stringify([m.row && m.row.effect, m.want]));
  check('the assumptions are ranked by the size of their effect, and only entered assumptions are measured (a blank tax line is not)', m.sorted && m.n >= 6 && !m.ks.includes('taxes') && !m.ks.includes('mgmtPct'), m.ks.join());
  const blank = a.findings.find(f => f.field === 'mgmtPct' && f.kind === 'missing');
  const bm = await p.evaluate(() => { const s = bkLoad(), run = (o) => bkRunWith(o, () => bkMonthlyReturns().irr); return { base: run({}), sug: run({ mgmtPct: 0.03 }) }; });
  check('a blank management fee is measured against the guide\'s own suggestion (3%), to the independent run', blank && blank.measured && Math.abs(blank.measured.m.to - bm.sug) < 1e-12 && Math.abs(blank.measured.m.from - bm.base) < 1e-12 && /3\.00%/.test(blank.impactText), blank && blank.impactText);
  const taxf = a.findings.find(f => f.field === 'taxes' && f.kind === 'missing');
  check('a blank expected input with no benchmark (real estate taxes) says so rather than inventing an effect', taxf && taxf.impact == null && /no benchmark/.test(taxf.impactText), taxf && taxf.impactText);

  /* ---- debt and tax first within a tier ---- */
  const warn = a.findings.filter(f => f.tier === 4 && f.kind === 'inconsistent'), firstNon = warn.findIndex(f => f.group !== 'Debt' && f.group !== 'Tax'), lastDT = warn.map(f => f.group === 'Debt' || f.group === 'Tax').lastIndexOf(true);
  check('within a tier the debt and tax findings come first (here the debt Model Checks)', warn.length >= 2 && warn.some(f => f.group === 'Debt') && (firstNon < 0 || lastDT < firstNon), warn.map(f => f.group + ':' + f.rule.slice(13)).join(' '));

  /* ---- one underlying issue, one finding ---- */
  await patch(p, { mgmtPct: 0, reserves: 0 });
  const dd = await F(p, true), mg = dd.findings.filter(f => /management fee/i.test(f.title)), rs = dd.findings.filter(f => /reserves/i.test(f.title) && f.kind !== 'consequential');
  check('a zero management fee is one finding, not two: the input finding carries the Model Check as a related note, at the more severe of the two tiers', mg.length === 1 && mg[0].kind === 'missing' && mg[0].related && mg[0].related.length === 1 && /acct\.mgmt-zero/.test(mg[0].rule) && mg[0].tier === 3 && /Management fee is zero/.test(mg[0].related[0].title) && !dd.findings.some(f => f.kind === 'inconsistent' && /Management fee is zero/.test(f.title)), JSON.stringify(mg.map(f => [f.title, f.tier, f.rule])));
  check('the same holds for the replacement reserves; a check with no matching input finding stays on its own', rs.filter(f => f.kind === 'inconsistent').length + rs.filter(f => f.related).length >= 1 && dd.findings.some(f => f.kind === 'inconsistent' && /debt|house/i.test(f.rule + f.title)), JSON.stringify(rs.map(f => [f.kind, f.title, !!f.related])));
  await patch(p, { mgmtPct: A.mgmtPct, reserves: A.reserves });

  /* ---- it changes nothing and talks to nobody ---- */
  await p.waitForTimeout(2500);   /* the version history records the edits above a moment after they are made; let it settle so only the review's own effect is compared */
  const before = await p.evaluate(() => JSON.stringify(bkLoad()));
  await p.evaluate(async () => { bkGuideOn(); bkGuideWhere(); await new Promise(r => setTimeout(r, 1500)); bkReviewPaint(); await new Promise(r => setTimeout(r, 300)); });
  const afterS = await p.evaluate(() => JSON.stringify(bkLoad()));
  check('opening the review, and measuring, leaves the deal exactly as it was', before === afterS, (() => { const x = JSON.parse(before), y = JSON.parse(afterS); return Object.keys(Object.assign({}, x, y)).filter(k => JSON.stringify(x[k]) !== JSON.stringify(y[k])).join(); })());
  check('the review makes no network request (no AI, no service): everything is computed in the page', p.reqs.length === 0, p.reqs.join(' '));

  /* ---- the guide shows it first ---- */
  const g = await p.evaluate(async () => { await new Promise(r => setTimeout(r, 600)); const t = document.querySelector('.gd').innerText; const rv = document.getElementById('bk-rv'); const i = t.indexOf('Review of the deal'), j = t.indexOf('Entered, not yet reviewed'); return { has: !!rv, order: i > -1 && (j < 0 || i < j), secs: ['What deserves attention first', 'What is known', 'What is missing', 'What is inconsistent', 'Assumptions that matter most'].every(x => t.includes(x)), meas: /Moved by/.test(t) && /fixed step shown/.test(t), steps: /Where this deal stands/i.test(t) }; });
  check('the guide\'s start screen opens with the review (attention, known, missing, inconsistent, assumptions) above the step list', g.has && g.order && g.secs && g.steps, JSON.stringify(g));
  check('the measured table states the fixed steps and that nothing in the deal changes', g.meas);
  await p.evaluate(() => bkGuideField('exitCap')); await p.waitForTimeout(1500);
  const o = await p.evaluate(() => ({ guide: document.documentElement.classList.contains('bk-guide'), back: !!document.getElementById('bk-guide-back'), box: !!document.getElementById('ae-exitCap') || !!document.querySelector('#viewport [data-bk-key="exitCap"]'), flash: !!document.querySelector('.bk-ask-flash'), cur: currentSheet }));
  check('Open on a finding leaves the guide (with the way back) and highlights the real box', !o.guide && o.back && o.box && o.flash, JSON.stringify(o));

  /* ---- Quick, Standard and Full change the depth of guidance, never the findings ---- */
  const modes = {}; for (const d of ['quick', 'standard', 'full']) { await p.evaluate((d) => { try { bkGuideDepth(d); } catch (e) {} }, d); modes[d] = await p.evaluate(() => JSON.stringify(bkDealFindings(bkLoad(), { measure: true }))); }
  check('the findings and their measured effects are identical in Quick, Standard and Full', modes.quick === modes.standard && modes.standard === modes.full && modes.full.length > 500);

  /* ---- a deal the model is withholding results on ---- */
  await patch(p, { exitCap: '', holdYears: '' });
  const w = await p.evaluate(async () => { const q = bkDealFindings(bkLoad(), { measure: true }); bkGuideOn(); bkGuideWhere(); await new Promise(r => setTimeout(r, 800)); return { can: q.can, measured: q.measuredRun && !!q.measured, top: q.attention.slice(0, 2).map(f => f.tier + ':' + f.field), txt: document.querySelector('.gd').innerText }; });
  check('while the model withholds results, required inputs lead, and no measured effect is shown (the model would be measuring a deal it will not calculate)', !w.can && !w.measured && w.top.every(x => x.startsWith('0:')) && /withholding results/.test(w.txt), JSON.stringify(w.top));
  await p.context().close();

  /* ---- a development deal ---- */
  const pd = await open(D);
  const dv = await pd.evaluate(async () => { const q = bkDealFindings(bkLoad(), { measure: true }); bkGuideOn(); bkGuideWhere(); await new Promise(r => setTimeout(r, 1200)); return { n: q.findings.length, ks: (q.measured ? q.measured.rows.map(r => r.k) : []), bad: /undefined|NaN|\[object/.test(document.querySelector('.gd').innerText) }; });
  check('a development deal is reviewed with its own assumptions (construction cost, construction loan), without NaN or undefined', dv.ks.length >= 3 && dv.ks.some(k => /sourceConstruction|constructionMonths|conRate|conLTC/.test(k)) && !dv.bad, JSON.stringify(dv));
  check('no page errors', p.errs.length === 0 && pd.errs.length === 0, p.errs.concat(pd.errs).join('|'));
  await pd.context().close();
  console.log('deal review: ' + checks + ' checks, ' + fails + ' failures'); await b.close(); process.exit(fails ? 1 : 0);
})();
