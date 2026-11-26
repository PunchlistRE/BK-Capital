// Import OM review: accept, edit or leave out what the reader took, and teach it where an answer is printed.
//   An edit changes the deal and recomputes its NOI tie; leaving a line out sets it to $0; Undo puts the OM's figure back.
//   Editing the price to a figure printed in the OM remembers the words beside it, and the next OM that prints those words is read from there.
//   node audit/om_review_test.js index.html
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); const path = require('path'), fs = require('fs');
const F = n => fs.readFileSync(path.join(__dirname, 'fixtures', 'om_fairfield_pages', n), 'utf8');
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const p = await b.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route(/supabase\.co|vercel\.app|fonts\.g|cdn\.jsdelivr/, r => r.abort());
  await p.goto('file://' + path.resolve(process.argv[2])); await p.waitForTimeout(700);
  await p.evaluate(() => { document.documentElement.classList.add('bk-auth-ok'); localStorage.removeItem('bkcapital.learn.loc.v1'); });
  let checks = 0, fails = 0; const check = (n, ok, d) => { checks++; if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? '  [' + String(d).slice(0, 300) + ']' : '')); };
  const pages = []; for (let i = 1; i <= 25; i++) pages.push('18 Fairfield Avenue\nNorwalk, CT 06854\nPhotos ' + i);
  pages[1] = F('fairfield_p2.txt'); pages[3] = F('fairfield_p4.txt'); pages[18] = F('fairfield_p19.txt'); pages[19] = F('fairfield_p20.txt');
  const load = (pg, price) => p.evaluate(([pg, price]) => { bkCreateNewDeal({ name: 'x', dealId: 'X' }); const S = bkOMState(); S.info = { pages: pg, method: 'text' }; S.om = bkOMParse(pg); S.listingOnly = !(S.om.ie && S.om.ie.gsr); S.basis = 'cur'; S.dec = {}; S.ov = {}; S.mPrice = price; S.file = { name: 'test.pdf' }; S.mode = 'om'; S.result = true; }, [pg, price]);
  const state = () => p.evaluate(() => { const S = bkOMState(), b = bkOMBuild(S.om, S.basis, 'test.pdf'); const h = RENDERERS['Import OM']().main;
    return { taxes: b.deal.taxes, insurance: b.deal.insurance, tie: b.tie, want: b.want, reviewed: b.reviewed || 0, edited: /bk-omr-st edit/.test(h), left: /bk-omr-st reject/.test(h), hasEdit: /bkOMEdit\('taxes'\)/.test(h), rejectOnPrice: /bkOMOv\('purchasePrice','reject'\)/.test(h), msg: S.learnMsg }; });
  await load(pages, 5300000);
  const a = await state();
  check('each row offers Edit; an expense line offers Reject; the price can be edited but not rejected', a.hasEdit && !a.rejectOnPrice && a.reviewed === 0, JSON.stringify(a));
  await p.evaluate(() => bkOMOv('taxes', 'edit', '$50,000'));
  const e = await state();
  check('an edit sets the deal\'s figure ($50,000 of taxes), marks the row Edited and recomputes the NOI tie by the difference', e.taxes === 50000 && e.edited && e.reviewed === 1 && Math.abs((a.tie - e.tie) - (50000 - a.taxes)) < 2, JSON.stringify([a.taxes, a.tie, e.tie]));
  await p.evaluate(() => bkOMOv('insurance', 'reject'));
  const r = await state();
  check('rejecting a line leaves it out ($0) and marks the row Left out', r.insurance === 0 && r.left && r.reviewed === 2, JSON.stringify(r));
  const made = await p.evaluate(() => { bkOMCreate(); const d = bkLoad(), r = bkDealReadiness(); return { taxes: d.taxes, insurance: d.insurance, calc: bkCalc().insurance, missing: (r.missing || []).map(m => m.key || m.label || m) }; });
  check('creating the deal carries your changes into it ($50,000 of taxes, insurance left out and counted as $0, nothing asked for again)', made.taxes === 50000 && Number(made.insurance || 0) === 0 && !made.missing.length, JSON.stringify(made));
  await load(pages, 5300000); await p.evaluate(() => { const S = bkOMState(); S.ov = { taxes: { mode: 'edit', v: 50000 }, insurance: { mode: 'reject' } }; });
  await p.evaluate(() => { bkOMOv('taxes', 'undo'); bkOMOv('insurance', 'undo'); });
  const u = await state();
  check('Undo puts the OM\'s figures back', u.taxes === a.taxes && u.insurance === a.insurance && u.reviewed === 0, JSON.stringify([u.taxes, u.insurance]));
  // learning: an OM whose price sits beside wording the reader does not know
  const om1 = ['Kingsley Court Apartments\n12 Kingsley Court, Hartford, CT 06106\nOffered at $2,450,000\nAssessed value $1,180,000\n12 Units\nBuilt 1962'];
  await load(om1, null);
  await p.evaluate(() => bkOMOv('purchasePrice', 'edit', '2,450,000'));
  const l = await p.evaluate(() => ({ msg: bkOMState().learnMsg, loc: JSON.parse(localStorage.getItem('bkcapital.learn.loc.v1') || '{}') }));
  check('editing the price to a figure printed in the OM remembers the words beside it ("offered at")', l.loc.purchasePrice && l.loc.purchasePrice.label === 'offered at' && /offered at/.test(l.msg), JSON.stringify(l));
  const om2 = ['Maple Row Townhomes\n40 Maple Row, Hartford, CT 06105\nAssessed value $2,050,000\nOffered at $3,875,000\n16 Units'];
  const n2 = await p.evaluate(pg => { const S = bkOMState(); const o = bkOMParse(pg); S.info = { pages: pg }; return { raw: o.price }; }, om2);
  const l2 = await p.evaluate(pg => { const S = bkOMState(); S.ov = {}; S.learnMsg = ''; const rd = window.__bkOMApplyLearned ? window.__bkOMApplyLearned(bkOMParse(pg), pg) : null; return rd && { price: rd.price, learned: rd.learned && rd.learned.purchasePrice, method: rd.priceMethod }; }, om2);
  check('the next OM that prints "Offered at" is read from there: $3,875,000, marked as learned', l2 && l2.price === 3875000 && l2.learned && /learned/.test(l2.method), JSON.stringify([n2, l2]));
  await p.evaluate(() => bkOMForget());
  const f = await p.evaluate(() => localStorage.getItem('bkcapital.learn.loc.v1'));
  check('Forget these removes the learned places', f == null, f);
  check('no page errors', errs.length === 0, errs.join(' | '));
  console.log('om review: ' + checks + ' checks, ' + fails + ' failures'); await b.close(); process.exit(fails ? 1 : 0);
})();
