// Panel tabs: a long section (4+ panels) opens as a tab strip, one tab per panel, like the Property editor. Panels are hidden, never removed; a printed section carries all of them.
//   node audit/paneltabs_test.js index.html
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); const path = require('path');
const A = require(path.join(__dirname, 'deal.js'));
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  let checks = 0, fails = 0; const check = (n, ok, d) => { checks++; if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? '  [' + String(d).slice(0, 300) + ']' : '')); };
  const open = async (w, pref) => { const p = await b.newPage({ viewport: { width: w, height: w < 600 ? 844 : 1000 } }); p.errs = []; p.on('pageerror', e => p.errs.push(e.message)); await p.route(/supabase\.co|vercel\.app|fonts\.g|cdn\.jsdelivr/, r => r.abort()); await p.goto('file://' + path.resolve(process.argv[2])); await p.waitForTimeout(700);
    await p.evaluate((pref) => { document.documentElement.classList.add('bk-auth-ok'); if (pref !== null) localStorage.setItem('bk-pt-all', pref); }, pref); await p.evaluate((A) => { bkCreateNewDeal(A); const s = bkLoad(); Object.assign(s, A, { purchasePrice: 19800000 }); bkSave(s); }, A); return p; };
  const show = (p, sh) => p.evaluate(async (sh) => { showSheet(sh); await new Promise(r => setTimeout(r, 1300)); }, sh);
  const state = (p) => p.evaluate(() => { const m = document.querySelector('#viewport .main-col'), bar = m && m.querySelector(':scope > .bk-pt-bar'); if(!bar) return null; const panes = [...m.querySelectorAll(':scope > .bk-pt-pane')]; return { tabs: [...bar.querySelectorAll('.ae-tab:not(.bk-pt-all)')].map(t => t.textContent.trim()), on: [...bar.querySelectorAll('.ae-tab:not(.bk-pt-all)')].findIndex(t => t.classList.contains('on')), visible: panes.map(x => getComputedStyle(x).display !== 'none'), n: panes.length, allBtn: bar.querySelector('.bk-pt-all').textContent }; });
  const p = await open(1280, '0');

  /* ---- tabs on a long section ---- */
  await show(p, 'Debt'); let st = await state(p);
  check('Debt opens as a tab strip with one tab per panel (6 panels), named after their titles, the first selected', st && st.tabs.length === 6 && st.on === 0 && /Sizing Constraints/.test(st.tabs.join('|')) && /Loan Terms/.test(st.tabs.join('|')), st && st.tabs.join(' | '));
  check('only the selected panel is shown', st.visible.filter(Boolean).length === 1 && st.visible[0] === true);
  check('tab names are short and distinct', new Set(st.tabs).size === st.tabs.length && st.tabs.every(t => t.length <= 28), st.tabs.join(' | '));
  const first = await p.evaluate(() => { const pane = document.querySelector('#viewport .bk-pt-pane[data-i="0"]'); return { hasNote: !!pane.querySelector('.note-flag'), hasInput: !!pane.querySelector('input[placeholder=off]') }; });
  check('a note that follows a panel stays in that panel\'s tab', first.hasNote && first.hasInput);
  await p.evaluate(() => bkPanelTabsOpen(/Sizing Constraints/)); st = await state(p);
  check('choosing a tab shows that panel and hides the others', st.on === 1 && st.visible[1] === true && st.visible.filter(Boolean).length === 1);
  const sc = await p.evaluate(() => document.querySelector('#viewport .bk-pt-pane[data-i="1"]').innerText);
  check('the panel shown is the one named (Sizing Constraints)', /Maximum LTV/.test(sc) && /Sized Loan/.test(sc));
  await show(p, 'Returns'); await show(p, 'Debt'); st = await state(p);
  check('the last tab used is remembered for the section (Debt returns to Sizing Constraints after visiting Returns)', st.on === 1, st.on);
  const ret = await p.evaluate(async () => { showSheet('Returns'); await new Promise(r => setTimeout(r, 1200)); const m = document.querySelector('#viewport .main-col'); return { bar: !!m.querySelector(':scope > .bk-pt-bar'), tilesOut: !!m.querySelector(':scope > .bk-tiles, :scope > .pf'), stepOut: !!m.querySelector(':scope > .bk-stepnav'), notesOut: !!m.querySelector(':scope > details.bk-notes'), idx: bkPanelTabsActive() }; });
  check('headline tiles above the panels, and the model notes and next-step bar below them, stay outside the tabs; each section has its own remembered tab', ret.bar && ret.tilesOut && ret.stepOut && ret.notesOut && ret.idx === 0, JSON.stringify(ret));

  /* ---- nothing is removed ---- */
  await show(p, 'Debt');
  const tabbed = await p.evaluate(() => [...document.querySelectorAll('#viewport .bk-pt-pane')].map(x => x.textContent.replace(/\s+/g, ' ').trim()).join(' || '));
  await p.evaluate(() => bkPanelTabsShowAll(true)); await p.waitForTimeout(200); const all = await state(p);
  check('Show all puts every panel on the page again', all.visible.every(Boolean) && all.allBtn === 'Show as tabs' && all.on === -1, JSON.stringify(all.visible));
  await p.evaluate(() => bkPanelTabsShowAll(false)); await show(p, 'Debt');
  const untab = await p.evaluate(async () => { bkPanelTabsShowAll(true); showSheet('Debt'); await new Promise(r => setTimeout(r, 1200)); return [...document.querySelectorAll('#viewport .bk-pt-pane')].map(x => x.textContent.replace(/\s+/g, ' ').trim()).join(' || '); });
  check('the panels hold exactly the same content whether shown as tabs or all at once (nothing is dropped)', tabbed === untab && tabbed.length > 500, tabbed.length + ' / ' + untab.length);
  await p.evaluate(() => bkPanelTabsShowAll(false)); await show(p, 'Debt'); await p.evaluate(() => bkPanelTabsOpen(/Loan Terms/));
  await p.emulateMedia({ media: 'print' });
  const pr = await p.evaluate(() => { const panes = [...document.querySelectorAll('#viewport .bk-pt-pane')], bar = document.querySelector('#viewport .bk-pt-bar'); return { vis: panes.every(x => getComputedStyle(x).display !== 'none'), bar: getComputedStyle(bar).display }; }); await p.emulateMedia({ media: 'screen' });
  check('a printed section carries every panel and no tab strip', pr.vis && pr.bar === 'none', JSON.stringify(pr));
  await p.evaluate(() => bkPanelTabsOpen(/Debt Sizing/));
  const edit = await p.evaluate(async () => { const i = document.querySelector('#viewport input[placeholder=off]'); i.value = '9.5'; i.dispatchEvent(new Event('change')); await new Promise(r => setTimeout(r, 900)); return Number(bkLoad().acqDebtYield); });
  check('a field in a tab still edits the deal', Math.abs(edit - 0.095) < 1e-9, edit);

  /* ---- behaviour ---- */
  await show(p, 'Debt'); await p.evaluate(() => bkPanelTabsOpen(/Debt Sizing/));
  await p.evaluate(() => document.querySelector('#viewport .bk-pt-bar .ae-tab.on').focus()); await p.keyboard.press('ArrowRight'); await p.waitForTimeout(150); st = await state(p);
  check('the arrow keys move between tabs', st.on === 1, st.on);
  for (const sh of ['Home', 'Deal Underwrite', 'Import OM', 'Cash Flow Report', 'Valuation Report', 'Lease Schedule']) { await show(p, sh); const s2 = await state(p); check(sh + ': no tab strip (an excluded or short section)', s2 === null); }
  await p.evaluate(async () => { showSheet('Property'); await new Promise(r => setTimeout(r, 900)); }); check('the Property editor keeps its own tabs (no second strip)', await p.evaluate(() => !document.querySelector('#viewport .bk-pt-bar')));
  const many = []; for (const sh of ['Operating Underwrite', 'Sponsor CF', 'IC Memo', 'Sensitivity', 'Covenant Monitor', 'Equity Waterfall', 'Rent Roll']) { await show(p, sh); const s3 = await state(p); many.push(sh + ':' + (s3 ? s3.tabs.length : 0)); }
  check('the other long sections get tabs too', many.every(x => !/:0$/.test(x)), many.join(' '));
  const pp = await open(1280, null); await show(pp, 'Debt');
  check('under automated test the panels start expanded unless tabs are asked for (existing tests read whole pages)', (await pp.evaluate(() => [...document.querySelectorAll('#viewport .bk-pt-pane')].every(x => getComputedStyle(x).display !== 'none'))) === true && (await pp.evaluate(() => bkPanelTabsActive())) === null);

  /* ---- phone ---- */
  const m = await open(390, '0'); await show(m, 'Debt');
  const ph = await m.evaluate(() => { const bar = document.querySelector('#viewport .bk-pt-bar'), cs = getComputedStyle(bar); return { h: Math.round(bar.getBoundingClientRect().height), wrap: cs.flexWrap, ox: cs.overflowX, scroll: bar.scrollWidth > bar.clientWidth, page: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1 }; });
  check('phone: the tab strip is one scrolling row (it does not wrap into a tall block), and the page does not scroll sideways', ph.h < 60 && ph.wrap === 'nowrap' && ph.scroll && ph.page, JSON.stringify(ph));
  check('no page errors', p.errs.length === 0 && m.errs.length === 0, p.errs.concat(m.errs).slice(0, 2).join(' | '));
  await b.close(); console.log(checks + ' checks, ' + fails + ' failures'); process.exit(fails ? 1 : 0);
})();
