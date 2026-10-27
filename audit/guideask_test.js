// Ask the guide: plain-words questions get a direction (answer, path, Take me there). Every topic must land on a real page, tab, panel and field; answers
// that quote a figure must quote the engine's figure; asking never changes the deal.
//   node audit/guideask_test.js index.html
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); const path = require('path');
const A = require(path.join(__dirname, 'deal.js'));
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  let checks = 0, fails = 0; const check = (n, ok, d) => { checks++; if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? '  [' + String(d).slice(0, 300) + ']' : '')); };
  const p = await b.newPage({ viewport: { width: 1280, height: 1000 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route(/supabase\.co|vercel\.app|fonts\.g|cdn\.jsdelivr/, r => r.abort()); await p.goto('file://' + path.resolve(process.argv[2])); await p.waitForTimeout(700);
  await p.evaluate((A) => { document.documentElement.classList.add('bk-auth-ok'); localStorage.setItem('bk-pt-all', '0'); bkCreateNewDeal(A); const s = bkLoad(); Object.assign(s, A, { purchasePrice: 19800000 }); bkSave(s); }, A);

  /* ---- every topic lands somewhere real ---- */
  const topics = await p.evaluate(() => bkAskTopics());
  check('there is a useful list of topics (50+)', topics.length >= 50, topics.length);
  const bad = [];
  for (const t of topics) {
    const r = await p.evaluate(async (go) => {
      if (!RENDERERS[go.sheet]) return { missing: true };
      bkAskGo(go); await new Promise(r => setTimeout(r, 1500));
      const cur = currentSheet, out = { cur };
      if (go.field) out.field = !!document.getElementById(go.field);
      if (go.panel) { const bar = document.querySelector('#viewport .main-col > .bk-pt-bar'); out.panel = !!bar && [...bar.querySelectorAll('.ae-tab:not(.bk-pt-all)')].some(x => new RegExp(go.panel, 'i').test(x.textContent)); out.on = bar ? [...bar.querySelectorAll('.ae-tab.on')].some(x => new RegExp(go.panel, 'i').test(x.textContent)) : false; }
      return out; }, t.go);
    if (r.missing) { if (!t.optional) bad.push(t.title + ': no such page ' + t.go.sheet); continue; }
    if (r.cur !== t.go.sheet) bad.push(t.title + ': landed on ' + r.cur);
    if (t.go.field && !r.field) bad.push(t.title + ': field ' + t.go.field + ' not on page');
    if (t.go.panel && !r.panel) bad.push(t.title + ': no tab ' + t.go.panel);
    if (t.go.panel && r.panel && !r.on) bad.push(t.title + ': tab not opened');
  }
  check('every topic opens its page, finds its field and opens its panel tab', bad.length === 0, bad.join(' || '));

  /* (some pages seed their own defaults into the deal when first opened; that is not the Ask box, so the "nothing written" check starts after the crawl) */
  const before = await p.evaluate(() => JSON.stringify(bkLoad()));

  /* ---- questions in plain words ---- */
  const top = async (q) => (await p.evaluate((q) => bkAsk(q), q)).map(x => x.title);
  const expect = [
    ['Where do I change the exit cap?', 'Exit cap rate'], ['what is my DSCR', 'DSCR and debt yield'], ['how do I model NNN recoveries', 'Commercial leases and NNN recoveries'],
    ['where is the waterfall', 'Equity waterfall'], ['where do I put the vacancy assumption', 'Vacancy'], ['how do I change the preferred return', 'Preferred return and hurdles'],
    ['what is the interest rate on the loan', 'Interest rate'], ['where can I import a rent roll', 'Import a rent roll'], ['show me the gantt chart', 'Development schedule (Gantt)'],
    ['what is the residual land value', 'Residual land value'], ['what price can I pay to hit a 15% IRR', 'Solve for a price or a rent'], ['which constraint limits the loan', 'Which loan constraint binds'],
    ['where are the sources and uses', 'Sources and uses'], ['hold period', 'Hold period'], ['what is the IRR', 'IRR and equity multiple'], ['S-curve for construction draws', 'Construction draws and curves'],
    ['how do I set the management fee', 'Operating expenses'], ['sell or hold', 'Sell versus hold']];
  for (const [q, want] of expect) { const t = await top(q); check('"' + q + '" finds ' + want, t[0] === want, t.join(' / ')); }
  const none = await p.evaluate(() => bkAsk('banana smoothie recipe'));
  check('a question it does not know gets no invented answer', none.length === 0);

  /* ---- answers quote the engine ---- */
  const live = await p.evaluate(() => { const s = bkLoad(), d = bkDebt(), r = bkMonthlyReturns(), c = bkCalc(); return { ex: bkAsk('what is the exit cap')[0].answer, irr: bkAsk('what is my irr')[0].answer, dscr: bkAsk('what is my dscr')[0].answer, price: bkAsk('purchase price')[0].answer, exitCap: s.exitCap, irrV: r.irr, moic: r.moic, dscrV: d && d.dscr, priceV: s.purchasePrice, cap: bkAsk('going in cap rate')[0].answer, noi: c.noi }; });
  check('exit cap answer quotes the deal\'s exit cap', live.ex.includes((live.exitCap * 100).toFixed(2) + '%'), live.ex);
  check('IRR answer quotes the engine\'s IRR and multiple', live.irr.includes((live.irrV * 100).toFixed(1) + '%') && live.irr.includes(live.moic.toFixed(2) + 'x'), live.irr);
  check('DSCR answer quotes the debt engine\'s DSCR', live.dscrV ? live.dscr.includes(live.dscrV.toFixed(2) + 'x') : /DSCR/.test(live.dscr), live.dscr);
  check('price answer quotes the deal\'s price', live.priceV ? live.price.includes('$' + Math.round(live.priceV).toLocaleString('en-US')) : true, live.price);
  check('going-in cap answer says it is calculated, never the broker\'s', /calculated/i.test(live.cap) && /broker/i.test(live.cap), live.cap);

  /* ---- the Guide page and the button on other pages ---- */
  await p.evaluate(() => bkGuideOn()); await p.waitForTimeout(900);
  check('the Guide page opens with an Ask box', await p.evaluate(() => currentSheet === 'Guide' && !!document.querySelector('#viewport #bk-ask-g-q')));
  await p.fill('#bk-ask-g-q', 'where do I change the exit cap'); await p.press('#bk-ask-g-q', 'Enter');
  const card = await p.evaluate(() => { const c = document.querySelector('#bk-ask-g-res .bk-ask-card'); return c ? { t: c.querySelector('.bk-ask-t').textContent, path: c.querySelector('.bk-ask-p').textContent, btn: !!c.querySelector('.bk-ask-go') } : null; });
  check('Enter shows the answer card with its path and a Take me there button', card && card.t === 'Exit cap rate' && /Valuation/.test(card.path) && card.btn, JSON.stringify(card));
  await p.click('#bk-ask-g-res .bk-ask-go'); await p.waitForTimeout(1500);
  const arrived = await p.evaluate(() => ({ sh: currentSheet, f: !!document.getElementById('ae-exitCap'), flashed: !!document.querySelector('.bk-ask-flash') }));
  check('Take me there opens Property > Valuation and highlights the exit cap field', arrived.sh === 'Valuation' && arrived.f && arrived.flashed, JSON.stringify(arrived));
  check('an "Ask the guide" button is on other pages while the guide is on', await p.evaluate(() => !!document.getElementById('bk-ask-fab')));
  await p.click('#bk-ask-fab'); await p.fill('#bk-ask-p-q', 'what is my dscr'); await p.press('#bk-ask-p-q', 'Enter');
  check('the button opens the same box in a pop-up with an answer', await p.evaluate(() => !!document.querySelector('#bk-ask-pop.open #bk-ask-p-res .bk-ask-card')));
  await p.press('#bk-ask-p-q', 'Escape');
  check('Escape closes the pop-up', await p.evaluate(() => !document.querySelector('#bk-ask-pop.open')));
  await p.evaluate(() => bkGuideOff()); await p.waitForTimeout(500);
  check('the button is gone when the guide is off', await p.evaluate(() => !document.getElementById('bk-ask-fab')));

  /* ---- nothing was written ---- */
  const after = await p.evaluate(() => JSON.stringify(bkLoad()));
  check('asking and navigating never changed the deal', before === after);
  check('no page errors', errs.length === 0, errs.join(' | '));
  console.log('guideask: ' + checks + ' checks, ' + fails + ' failures'); await b.close(); process.exit(fails ? 1 : 0);
})();
