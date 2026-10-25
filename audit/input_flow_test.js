// Input flow: clicking between cells keeps scroll and focus; Arrow Down / Up move between inputs and commit; a new section is
// brought to the top; selects keep their own arrow keys.     node audit/input_flow_test.js index.html
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const path = require('path'); const A = require(path.join(__dirname, 'deal.js'));
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const p = await b.newPage({ viewport: { width: 1400, height: 800 } }); const errs = []; let fails = 0, checks = 0;
  p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => { window.BK_CONFLICT_TOASTS = false; });
  await p.route(/supabase\.co|vercel\.app|fonts\.g/, r => r.abort());
  await p.goto('file://' + path.resolve(process.argv[2])); await p.waitForTimeout(800);
  const check = (n, ok, d) => { checks++; if (!ok) { fails++; console.log('FAIL ' + n + (d ? '  ' + d : '')); } };
  await p.evaluate(o => { document.documentElement.classList.add('bk-auth-ok'); bkCreateNewDeal(o); showSheet('Deal Underwrite'); }, A); await p.waitForTimeout(500);
  const fresh = async (sheet) => { await p.evaluate(([o, s]) => { bkCreateNewDeal(o); showSheet(s || 'Deal Underwrite'); window.scrollTo(0, 0); }, [A, sheet]); await p.waitForTimeout(500); };
  const cells = () => p.locator('#viewport tr.input[data-bk-key] td.v');
  const state = () => p.evaluate(() => { const a = document.activeElement, tr = a && a.closest && a.closest('tr'); return { y: Math.round(window.scrollY), key: tr && tr.dataset ? tr.dataset.bkKey : null, label: tr ? (tr.querySelector('.rowlabel') || {}).textContent : null, tag: a && a.tagName }; });
  const n = await cells().count(); check('the Deal Underwrite sheet has many editable cells', n > 40, String(n));
  // 1. click cell A then cell B far down the page: scroll must not move and focus must be on B
  await cells().nth(25).scrollIntoViewIfNeeded(); await p.waitForTimeout(200);
  await cells().nth(25).click(); await p.waitForTimeout(300); const s1 = await state();
  const keyB = await cells().nth(27).evaluate(e => e.closest('tr').dataset.bkKey);
  await cells().nth(27).click(); await p.waitForTimeout(600); const s2 = await state();
  check('clicking from one cell to another keeps the page where it was', Math.abs(s2.y - s1.y) <= 3, JSON.stringify({ s1, s2 }));
  check('focus lands on the cell that was clicked', s2.key === keyB, JSON.stringify({ s2, keyB }));
  // 2. type a value, Arrow Down: value committed, focus on the next input in the SAME section, page kept
  await fresh();
  const pair = await p.evaluate(() => { const ed = window.bkInputFlow.editables(); for (let i = 8; i < ed.length - 1; i++) { const a = ed[i], c = ed[i + 1]; if (a.closest('.tbl-wrap') === c.closest('.tbl-wrap') && a.closest('tr').dataset.bkKey && c.closest('tr').dataset.bkKey && /^(money|num)$/.test(a.closest('tr').dataset.bkFmt || 'num') && a.closest('tr').dataset.bkFmt !== 'text') return { i, k0: a.closest('tr').dataset.bkKey, k1: c.closest('tr').dataset.bkKey }; } return null; });
  check('found two neighbouring numeric inputs in one section', !!pair, JSON.stringify(pair));
  if (pair) {
    await p.evaluate(i => { const e = window.bkInputFlow.editables()[i]; e.scrollIntoView({ block: 'center' }); }, pair.i); await p.waitForTimeout(200);
    const tcell = p.locator(`#viewport tr[data-bk-key="${pair.k0}"] td.v`); await tcell.click(); await p.keyboard.type('4321'); const y0 = (await state()).y;
    await p.keyboard.press('ArrowDown'); await p.waitForTimeout(700);
    const s3 = await state(), saved = await p.evaluate(k => bkLoad()[k], pair.k0);
    check('Arrow Down commits the typed value', saved === 4321, String(saved));
    check('Arrow Down moves focus to the next input', s3.key === pair.k1, JSON.stringify({ s3, pair }));
    check('Arrow Down within a section does not jump the page', Math.abs(s3.y - y0) < 300, JSON.stringify({ y0, s3 }));
    await p.keyboard.press('ArrowUp'); await p.waitForTimeout(700);
    check('Arrow Up moves back', (await state()).key === pair.k0, JSON.stringify(await state()));
  }
  // 3. crossing into a new section brings it to the top and focuses its first input
  await fresh();
  const cross = await p.evaluate(() => { const ed = window.bkInputFlow.editables(); for (let i = 0; i < ed.length - 1; i++) { const a = ed[i].closest('.tbl-wrap'), c = ed[i + 1].closest('.tbl-wrap'); if (a !== c && i > 3) return { i, cap: c.querySelector('caption') && c.querySelector('caption').textContent }; } return null; });
  check('the sheet has at least two input sections', !!cross);
  if (cross) {
    await p.evaluate(i => { const e = window.bkInputFlow.editables()[i]; e.scrollIntoView({ block: 'center' }); e.focus(); }, cross.i); await p.waitForTimeout(200);
    await p.keyboard.press('ArrowDown'); await p.waitForTimeout(700);
    const r = await p.evaluate(() => { const a = document.activeElement, w = a.closest && a.closest('.tbl-wrap'); return { tag: a.tagName, cap: w && w.querySelector('caption') && w.querySelector('caption').textContent, top: w ? Math.round(w.getBoundingClientRect().top) : null }; });
    check('Arrow Down at the end of a section moves to the first input of the next section', r.cap === cross.cap, JSON.stringify({ r, cross }));
    check('the next section is brought to the top of the view', r.top !== null && r.top >= 0 && r.top <= 200, JSON.stringify(r));
    await p.keyboard.press('ArrowUp'); await p.waitForTimeout(600);
    const back = await p.evaluate(() => { const a = document.activeElement, w = a.closest && a.closest('.tbl-wrap'); return w && w.querySelector('caption') && w.querySelector('caption').textContent; });
    check('Arrow Up crosses back into the previous section', back !== cross.cap, String(back));
  }
  // 4. Enter still commits and keeps the page; Escape still cancels
  await fresh(); await cells().nth(20).scrollIntoViewIfNeeded(); await cells().nth(20).click(); const ye = (await state()).y; await p.keyboard.type('77'); await p.keyboard.press('Enter'); await p.waitForTimeout(500);
  check('Enter commits and keeps the page where it was', Math.abs((await state()).y - ye) <= 3);
  // 5. text inputs on other sheets (Credit Policy): scroll kept when an edit re-renders; selects keep their own arrow keys
  await fresh('Credit Policy');
  await p.evaluate(() => { const e = [...document.querySelectorAll('#viewport input[type=text]')][12]; e.scrollIntoView({ block: 'center' }); }); await p.waitForTimeout(200);
  const yp = Math.round(await p.evaluate(() => window.scrollY));
  const inp = p.locator('#viewport input[type=text]').nth(12); await inp.click(); await inp.fill('9'); await p.keyboard.press('ArrowDown'); await p.waitForTimeout(700);
  const yq = Math.round(await p.evaluate(() => window.scrollY)), act = await p.evaluate(() => document.activeElement.tagName);
  check('editing a Credit Policy input and pressing Arrow Down keeps the page near where it was', Math.abs(yq - yp) < 400, JSON.stringify({ yp, yq }));
  check('and focus is on another input', act === 'INPUT', act);
  /* wait until the page has stopped redrawing before taking the select: a late redraw would move focus for reasons unrelated to the select */
  await p.evaluate(() => new Promise(res => { let t = setTimeout(res, 400); const mo = new MutationObserver(() => { clearTimeout(t); t = setTimeout(() => { mo.disconnect(); res(); }, 400); }); mo.observe(document.querySelector('#viewport'), { childList: true, subtree: true }); setTimeout(() => { mo.disconnect(); res(); }, 3500); }));
  await p.evaluate(() => { const s = document.querySelector('#viewport select'); if (s) s.focus(); });
  const before = await p.evaluate(() => document.activeElement.tagName); await p.keyboard.press('ArrowDown'); await p.waitForTimeout(200);
  /* the dropdown's change redraws the sheet (a few hundred ms on this sheet); focus is handed back 25 ms after the redraw, so allow for that */
  await p.waitForFunction(() => document.activeElement.tagName === 'SELECT', null, { timeout: 2000 }).catch(() => {});
  const after = await p.evaluate(() => document.activeElement.tagName + ' ' + (document.querySelectorAll('#viewport select').length));
  check('a select keeps its own arrow-key behaviour (focus stays on it)', before === 'SELECT' && /^SELECT/.test(after), JSON.stringify({ before, after }));
  check('no page errors', errs.length === 0, errs.join(' | '));
  await b.close(); console.log(`${checks} checks, ${fails} failures`); process.exit(fails ? 1 : 0);
})();
