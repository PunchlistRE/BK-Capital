// Section guide: with the Guide on, each section opens with what it shows, how to read it, checks calculated from THIS deal, and the next step.
//   node audit/sectionguide_test.js index.html
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); const path = require('path');
const A = require(path.join(__dirname, 'deal.js'));
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route(/supabase\.co|vercel\.app|fonts\.g|cdn\.jsdelivr/, r => r.abort()); await p.goto('file://' + path.resolve(process.argv[2])); await p.waitForTimeout(700);
  await p.evaluate(() => document.documentElement.classList.add('bk-auth-ok'));
  let checks = 0, fails = 0; const check = (n, ok, d) => { checks++; if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? '  [' + d + ']' : '')); };
  await p.evaluate((A) => { bkCreateNewDeal(A); const s = bkLoad(); Object.assign(s, A); bkSave(s); }, A);
    const sheets = await p.evaluate(() => bkSectionGuideSheets());
  check('the guide covers at least 25 sections', sheets.length >= 25, sheets.length);
  /* guide off: no card */
  await p.evaluate(async () => { localStorage.setItem('bkcapital.guide.on', '0'); showSheet('Returns'); await new Promise(r => setTimeout(r, 700)); });
  check('with the Guide off, no section guide is shown', await p.evaluate(() => !document.querySelector('#viewport .bk-sg')));
  /* guide on: every section */
  await p.evaluate(() => localStorage.setItem('bkcapital.guide.on', '1'));
  const missing = [], empty = [];
  for (const sh of sheets) {
    const r = await p.evaluate(async (sh) => { showSheet(sh); await new Promise(r => setTimeout(r, 600)); const g = document.querySelector('#viewport .bk-sg'); return g ? { t: g.innerText, sh: g.getAttribute('data-sh') } : null; }, sh);
    if (!r || r.sh !== sh) missing.push(sh); else if (!/what this shows/i.test(r.t) || !/next/i.test(r.t)) empty.push(sh);
  }
  check('every covered section shows its guide when opened', missing.length === 0, missing.join(', '));
  check('each guide says what the section shows and what to do next', empty.length === 0, empty.join(', '));
  /* the checks are calculated from the deal */
  const mr = await p.evaluate(() => { const m = bkMonthlyReturns(); return { irr: m.irr }; });
  const rt = await p.evaluate(async () => { showSheet('Returns'); await new Promise(r => setTimeout(r, 700)); return document.querySelector('#viewport .bk-sg').innerText; });
  check('Returns: the check quotes the engine\'s levered IRR (4.20%) against the 12.00% policy target and says how far below', rt.includes((mr.irr * 100).toFixed(2) + '%') && /12\.00%/.test(rt) && /below/.test(rt), (mr.irr * 100).toFixed(2));
  const dt = await p.evaluate(async () => { showSheet('Debt Capacity'); await new Promise(r => setTimeout(r, 900)); return document.querySelector('#viewport .bk-sg').innerText; });
  check('Debt Capacity: it flags the loan above house capacity by the calculated amount', /above capacity/.test(dt) && /\$11,272,955/.test(dt), dt.replace(/\s+/g, ' ').slice(dt.indexOf('CHECKS'), dt.indexOf('CHECKS') + 160));
  const dbt = await p.evaluate(async () => { showSheet('Debt'); await new Promise(r => setTimeout(r, 700)); return document.querySelector('#viewport .bk-sg').innerText; });
  check('Debt: it reports the loan, the binding constraint and the DSCR against the policy minimum', /\$13,427,000/.test(dbt) && /DSCR/.test(dbt) && /1\.25x/.test(dbt));
  const lay = await p.evaluate(async () => { showSheet('Debt'); await new Promise(r => setTimeout(r, 700)); const g = document.querySelector('#viewport .bk-sg'), li = [...g.querySelectorAll('.bk-sg-c li')], b = g.querySelector('.bk-sg-badge'); const cols = getComputedStyle(g.querySelector('.bk-sg-grid')).gridTemplateColumns.split(' ').length;
    g.open = false; g.dispatchEvent(new Event('toggle')); await new Promise(r => setTimeout(r, 50)); const stored = localStorage.getItem('bk-sg-open'); g.open = true; g.dispatchEvent(new Event('toggle')); return { first: li[0] && li[0].className, n: li.length, badge: b && b.innerText, cols, stored, terms: g.querySelectorAll('.bk-sg-d dt').length, next: g.querySelectorAll('.bk-sg-n button').length }; });
  check('Debt guide: the check that needs attention comes first and is counted in a badge; it reads in two columns, with terms, checks and next steps laid out as lists', lay.first === 'warn' && /1 thing to review/.test(lay.badge) && lay.cols === 2 && lay.terms >= 3 && lay.next === 2, JSON.stringify(lay));
  check('Debt guide: it flags the loan above house capacity', /above the house capacity/.test(dbt));
  check('the guide remembers whether it was collapsed', lay.stored === '0', lay.stored);
  /* where the step flow already guides, no second guide; the deal is untouched; the guide stays out of print */
  const d0 = await p.evaluate(async () => { showSheet('Deal Underwrite'); await new Promise(r => setTimeout(r, 600)); return !!document.querySelector('#viewport .bk-sg'); });
  check('Deal Underwrite (covered by the step-by-step flow) shows no extra section guide', d0 === false);
  await p.evaluate(async () => { showSheet('Returns'); await new Promise(r => setTimeout(r, 600)); });
  await p.emulateMedia({ media: 'print' }); const hid = await p.evaluate(() => getComputedStyle(document.querySelector('#viewport .bk-sg')).display === 'none'); await p.emulateMedia({ media: 'screen' });
  check('the guide is left out of a printed section', hid);
  /* the guide itself writes nothing: walking the same sections with the Guide off and on leaves the deal identical */
  const walk = async (guide) => p.evaluate(async ([A, guide, sheets]) => { localStorage.setItem('bkcapital.guide.on', guide ? '1' : '0'); bkCreateNewDeal(A); const s = bkLoad(); Object.assign(s, A); bkSave(s); for (const sh of sheets) { showSheet(sh); await new Promise(r => setTimeout(r, 250)); } showSheet('Returns'); await new Promise(r => setTimeout(r, 300)); return JSON.stringify(bkLoad(), (k, v) => /^(_lastSaved|updatedAt|savedAt|_ts|_hist.*|_template|_conventions|_provenance|createdAt|appliedAt)$/.test(k) ? undefined : v); }, [A, guide, sheets]);
  const offState = await walk(false), onState = await walk(true);
  check('walking every guided section with the Guide on leaves the deal exactly as with it off (the guide writes nothing)', offState === onState);
  check('no page errors', errs.length === 0, errs.slice(0, 2).join(' | '));
  console.log(checks + ' checks, ' + fails + ' failures'); await b.close(); process.exit(fails ? 1 : 0);
})();
