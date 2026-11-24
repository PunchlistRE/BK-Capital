/* SIDE MENU FOLD SIGNS. Every group heading in the left menu has a + or - sign. Clicking it, or pressing Enter or Space on it, folds or unfolds the group: the sign, the aria-expanded value and the visible sheets all change together, and a second press puts it back.
   This includes the headings that hold several sections (Property, Debt, Model & Data), which once ignored the click. A group keeps its state when another page is opened (the menu is rebuilt on every page change). Desktop, tablet and phone widths.
   Read-only: nothing here changes the app, a calculation or deal data.   node audit/rail_toggle_test.js index.html */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); const path = require('path'); const A = require(path.join(__dirname, 'deal.js')), V = require(path.join(__dirname, 'devdeal.js'));
const HTML = path.resolve(process.argv[2] || 'index.html'); let checks = 0, fails = 0; const check = (n, ok, d) => { checks++; if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? '  [' + String(d).slice(0, 300) + ']' : '')); };
(async () => { const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
 for (const w of [1440, 820, 390]) for (const [dn, deck] of [['acquisition', A], ['development', V]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: 900 }, isMobile: w <= 480, hasTouch: w <= 768 }), p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route(/supabase\.co|vercel\.app|fonts\.g|cdn\.jsdelivr/, r => r.abort()); await p.goto('file://' + HTML); await p.waitForTimeout(700);
  await p.evaluate(d => { document.documentElement.classList.add('bk-auth-ok'); bkCreateNewDeal(d); }, deck); await p.waitForTimeout(500);
  const openMenu = async () => { if (w <= 900) { await p.evaluate(() => document.getElementById('rail').classList.add('open')); await p.waitForTimeout(350); } }; await openMenu();
  const st = () => p.evaluate(() => [].map.call(document.querySelectorAll('#rail-groups .rail-group'), g => { const l = g.querySelector('.rail-group-label');
    return { name: l.querySelector('span').textContent, collapsed: g.classList.contains('pl-collapsed'), aria: l.getAttribute('aria-expanded'), sign: getComputedStyle(l, '::before').content, items: [].filter.call(g.querySelectorAll('.rail-item'), e => e.offsetParent !== null && e.getBoundingClientRect().height > 0).length, total: g.querySelectorAll('.rail-item').length }; }));
  const s0 = await st(), bad = [], tag = dn + ' ' + w + ' px';
  for (let i = 0; i < s0.length; i++) { const sel = '#rail-groups .rail-group:nth-child(' + (i + 1) + ') .rail-group-label', a = s0[i]; if (!a.total) continue;
   await p.click(sel); await p.waitForTimeout(200); const c = (await st())[i]; await p.click(sel); await p.waitForTimeout(200); const d = (await st())[i];
   await p.focus(sel); await p.keyboard.press('Enter'); await p.waitForTimeout(150); const k = (await st())[i]; await p.keyboard.press('Space'); await p.waitForTimeout(150); const k2 = (await st())[i];
   const flips = x => x.collapsed !== a.collapsed && x.aria !== a.aria && x.sign !== a.sign && (x.collapsed ? x.items === 0 : x.items > 0);
   if (!flips(c)) bad.push(a.name + ' click'); if (d.collapsed !== a.collapsed || d.items !== a.items || d.sign !== a.sign) bad.push(a.name + ' restore'); if (!flips(k) || k2.collapsed !== a.collapsed) bad.push(a.name + ' keyboard'); }
  check(tag + ': every group heading (' + s0.length + ') folds and unfolds by click and by Enter/Space, sign and sheets together', s0.length >= 5 && bad.length === 0, bad.slice(0, 5).join(' ; '));
  const fi = s0.findIndex(x => x.total > 0), sel0 = '#rail-groups .rail-group:nth-child(' + (fi + 1) + ') .rail-group-label'; await p.click(sel0); await p.waitForTimeout(150); const flipped = (await st())[fi].collapsed;
  await p.evaluate(() => showSheet('Returns')); await p.waitForTimeout(500); await openMenu(); const kept = (await st())[fi].collapsed;
  check(tag + ': a folded or unfolded group keeps its state after another page is opened', kept === flipped, 'set ' + flipped + ' then ' + kept);
  check(tag + ': no page errors', errs.length === 0, errs.join(' | ')); await ctx.close(); }
 console.log('side menu fold signs: ' + checks + ' checks, ' + fails + ' failures'); await b.close(); process.exit(fails ? 1 : 0); })();
