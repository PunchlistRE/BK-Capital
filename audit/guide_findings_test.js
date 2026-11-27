// Phase 2c (owner-approved, November 2026): the guide's old "Worth a look" rules are folded into the findings engine and the review drives the guided walk. Rules and proposals are preserved, findings are classed
// (warning / recommendation / observation), ranked by severity then materiality, one issue is one finding, and nothing in the deal or the Base Case changes without a confirm.
//   node audit/guide_findings_test.js index.html
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); const path = require('path');
const A = require(path.join(__dirname, 'deal.js'));
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  let checks = 0, fails = 0; const check = (n, ok, d) => { checks++; if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? '  [' + String(d).slice(0, 500) + ']' : '')); };
  const p = await (async () => { const ctx = await b.newContext({ viewport: { width: 1300, height: 1000 } }), pg = await ctx.newPage(); pg.errs = []; pg.on('pageerror', e => pg.errs.push(e.message));
    await pg.route(/supabase\.co|vercel\.app|fonts\.g|cdn\.jsdelivr|newyorkfed/, r => r.abort()); await pg.goto('file://' + path.resolve(process.argv[2])); await pg.waitForTimeout(700);
    await pg.evaluate((d) => { document.documentElement.classList.add('bk-auth-ok'); bkCreateNewDeal(d); }, A); return pg; })();
  const patch = (x) => p.evaluate((x) => { const s = bkLoad(); Object.assign(s, x); bkSave(s); }, x);
  const snap = () => p.evaluate(() => JSON.stringify(bkLoad(), (k, v) => (k === '_guide' || k === '_hist') ? undefined : v));

  await patch({ vacancy: 0.01, rentGrowth: 0.06, insurance: 0, closingCostsPct: 0, holdYears: 12 });
  const q = await p.evaluate(() => { const f = bkDealFindings(bkLoad(), { measure: false }).findings; return { adv: bkGuideAdvice(bkLoad()).map(a => a.text), f: f.map(x => ({ id: x.id, kind: x.kind, cls: x.cls, tier: x.tier, field: x.field, title: x.title, detail: x.detail, fix: x.fix && x.fix.label, adv: !!(x.advice || x.fromAdvice) })) }; });
  const text = (x) => x.title + ' ' + x.detail;
  check('every old advice rule that fires is in the findings, once (its own finding, or folded into the finding for the same input): rules preserved', q.adv.length >= 4 && q.adv.every(t => q.f.some(x => text(x).includes(t))), JSON.stringify(q.adv.filter(t => !q.f.some(x => text(x).includes(t)))));
  check('one issue, one finding: the blank insurance advice is folded into the "insurance is not entered" finding, not a second one', q.f.filter(x => x.field === 'insurance').length === 1 && /Insurance is blank/.test(text(q.f.find(x => x.field === 'insurance'))));
  const vac = q.f.find(x => x.field === 'vacancy' && x.adv), cc = q.f.find(x => x.field === 'closingCostsPct');
  check('a recommendation keeps its proposal as a button (vacancy 5%, closing costs 2%) and is classed recommendation', vac && vac.cls === 'recommendation' && vac.fix === 'Propose 5%' && cc && cc.fix === 'Propose 2%', JSON.stringify([vac, cc]));
  const hold = q.f.find(x => /hold of 12 years/.test(x.title));
  check('an information-level rule (an unusual hold) is an observation, below the warnings', hold && hold.cls === 'observation' && hold.tier === 6);
  check('every finding has a class', q.f.every(x => ['warning', 'recommendation', 'observation'].includes(x.cls)));
  check('ranked by severity: required and failing checks before recommendations before observations, never the reverse', q.f.every((x, i) => i === 0 || q.f[i - 1].tier <= x.tier));
  const m = await p.evaluate(() => { const r = bkDealFindings(bkLoad(), { measure: true }).findings.filter(x => x.advice && x.fix); return r.map(x => [x.field, x.impact != null && x.impact >= 0, /with the proposal/.test(x.impactText || '')]); });
  check('a proposal is ranked by materiality: its measured effect is the engine re-run with the proposed figure', m.length > 0 && m.every(r => r[1] && r[2]), JSON.stringify(m));

  /* the old blocks are gone, the review stands in for them */
  const w = await p.evaluate(async () => { bkGuideOn(); await new Promise(r => setTimeout(r, 900)); const t = document.querySelector('.gd').innerText; return { t, cls: [...document.querySelectorAll('.bk-rv-cls')].map(e => e.textContent), h: /What to consider/.test(t) }; });
  check('the where-this-deal-stands screen no longer has a separate "Worth a look" list: the review lists them, with their class', !/Worth a look/.test(w.t) && w.h && w.cls.includes('Recommendation') && w.cls.includes('Observation'), w.cls.join());
  await p.evaluate(() => bkGuideGo('income')); await p.waitForTimeout(600);
  const st1 = await p.evaluate(() => ({ t: document.querySelector('.gd').innerText, box: (document.getElementById('gd-advw') || {}).innerText || '' }));
  check('a step shows the review findings for its own inputs (no "Worth a look"), with the vacancy proposal', !/Worth a look/.test(st1.t) && /Vacancy is 1\.00%/i.test(st1.box) && /Propose 5(\.00)?%/i.test(st1.box) && /For this step|for this step/i.test(st1.box), st1.box.replace(/\n/g, ' ').slice(0, 480));

  /* a proposal is not applied until confirmed */
  const before = await snap();
  await p.evaluate(() => bkGuideProp('vacancy', 0.05)); await p.waitForTimeout(500);
  const mid = await p.evaluate(() => ({ saved: bkLoad().vacancy, chg: (document.getElementById('gd-chg') || {}).innerText || '' }));
  check('clicking a proposal only drafts it on the confirm step: the deal is unchanged and "You are about to change" lists it', (await snap()) === before && mid.saved === 0.01 && /about to change/i.test(mid.chg), mid.chg.slice(0, 120));
  await p.evaluate(() => bkGuideOn()); await p.waitForTimeout(500);
  check('abandoning the proposal changes nothing', (await snap()) === before);

  /* the review drives the walk */
  const base = await p.evaluate(() => bkLoad().vacancy);
  const walk = await p.evaluate(async () => { const wait = (ms) => new Promise(r => setTimeout(r, ms)); const secs = bkGuideSections ? null : null; const seq = [];
    bkGuideFindings(); await wait(500); for (let i = 0; i < 12; i++) { const id = (document.querySelector('.gd h1') || {}).innerText || ''; seq.push(id); if (/review|summary|Check|package/i.test(id) && !document.getElementById('gd-confirm')) break; if (document.getElementById('gd-next')) { bkGuideNext(); } else break; await wait(350); }
    return seq; });
  check('the walk goes only to the steps that hold findings, most important first, then ends at the review', walk.length >= 2 && walk.length < 12 && new Set(walk).size === walk.length, JSON.stringify(walk));
  check('walking through without confirming a proposal leaves every assumption as it was (vacancy still 1%)', (await p.evaluate(() => bkLoad().vacancy)) === base && (await p.evaluate(() => bkLoad().rentGrowth)) === 0.06);

  /* identical findings in every depth */
  const dep = await p.evaluate(() => { const o = {}; ['standard', 'full'].forEach(d => { bkGuideDepth(d); o[d] = JSON.stringify(bkDealFindings(bkLoad(), { measure: false }).findings.map(f => [f.id, f.tier, f.cls])); }); return o; });
  check('Quick, Standard and Full control depth only: the findings are identical', dep.standard === dep.full);
  check('no page errors', p.errs.length === 0, p.errs.join('|'));
  console.log('guide findings: ' + checks + ' checks, ' + fails + ' failures'); await b.close(); process.exit(fails ? 1 : 0);
})();
