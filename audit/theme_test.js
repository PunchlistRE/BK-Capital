// Day / night toggle: a round header button (sun while dark, moon while light). Follows the device until you click, then keeps your choice; the whole
// app (including the editor and the institutional layer, which have no explicit dark set of their own) must actually turn dark or light, not half of it.
//   node audit/theme_test.js index.html
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); const path = require('path');
const A = require(path.join(__dirname, 'deal.js'));
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  let checks = 0, fails = 0; const check = (n, ok, d) => { checks++; if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? '  [' + String(d).slice(0, 300) + ']' : '')); };
  const open = async (os, w) => {
    const ctx = await b.newContext({ colorScheme: os, viewport: { width: w || 1280, height: 900 } }); const p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
    await p.route(/supabase\.co|vercel\.app|fonts\.g|cdn\.jsdelivr/, r => r.abort()); await p.goto('file://' + path.resolve(process.argv[2])); await p.waitForTimeout(700);
    await p.evaluate((A) => { document.documentElement.classList.add('bk-auth-ok'); localStorage.setItem('bk-pt-all', '1'); bkCreateNewDeal(A); const s = bkLoad(); Object.assign(s, A, { purchasePrice: 19800000 }); bkSave(s); }, A); return p; };
  const lum = (c) => { const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?/.exec(c); if (!m) return null; if (m[4] !== undefined && +m[4] === 0) return null; return (0.2126 * m[1] + 0.7152 * m[2] + 0.0722 * m[3]) / 255; };
  const paint = (p) => p.evaluate(() => { const cs = (e) => e && getComputedStyle(e); const bg = (e) => { while (e) { const c = getComputedStyle(e).backgroundColor; if (!/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return c; e = e.parentElement; } return 'rgb(255,255,255)'; };
    const body = document.body, panel = document.querySelector('#viewport .tbl-wrap, #viewport .ae-panel, #viewport .bk-box, #viewport .card'), cell = document.querySelector('#viewport td, #viewport .ae-form label, #viewport p');
    return { body: bg(body), panel: panel ? bg(panel) : null, text: cell ? cs(cell).color : null, attr: document.documentElement.getAttribute('data-theme') }; });
  const show = (p, sh) => p.evaluate(async (sh) => { showSheet(sh); await new Promise(r => setTimeout(r, 1000)); }, sh);
  const isDark = (x) => lum(x.body) < 0.35 && (x.panel === null || lum(x.panel) < 0.4) && (lum(x.text) === null || lum(x.text) > 0.5);
  const isLight = (x) => lum(x.body) > 0.7 && (x.panel === null || lum(x.panel) > 0.7) && (lum(x.text) === null || lum(x.text) < 0.5);

  /* ---- the button ---- */
  let p = await open('light');
  const btn = await p.evaluate(() => { const e = document.getElementById('bk-theme-btn'); if (!e) return null; const r = e.getBoundingClientRect(), c = getComputedStyle(e); return { w: r.width, h: r.height, radius: c.borderRadius, icon: e.getAttribute('data-icon'), svg: !!e.querySelector('svg'), inBar: !!e.closest('.brand-bar'), label: e.getAttribute('aria-label'), vis: r.width > 0 && r.top >= 0 && r.bottom <= 80 }; });
  check('a round button sits in the header', btn && Math.abs(btn.w - btn.h) < 1 && btn.w >= 32 && btn.w <= 44 && /50%|19px|20px/.test(btn.radius) && btn.inBar && btn.vis, JSON.stringify(btn));
  check('on a light device it starts light and shows a moon (click for night)', btn.icon === 'moon' && btn.svg && /night/i.test(btn.label), JSON.stringify(btn));
  let x = await paint(p); check('light device, no choice: the page is light', isLight(x), JSON.stringify(x));

  /* ---- toggling light device -> night, on several sections including the editor and the institutional layer ---- */
  await p.click('#bk-theme-btn'); await p.waitForTimeout(800);
  check('clicking switches to night and the icon becomes a sun', await p.evaluate(() => document.documentElement.getAttribute('data-theme') === 'dark' && document.getElementById('bk-theme-btn').getAttribute('data-icon') === 'sun'));
  for (const sh of ['Home', 'Property', 'Valuation', 'Returns', 'Debt', 'Sensitivity', 'IC Memo', 'Equity Waterfall']) { await show(p, sh); x = await paint(p); check('night on a light device: ' + sh + ' is dark (body, panel, text)', isDark(x), JSON.stringify(x)); }
  await p.evaluate(() => bkGuideOn()); await p.waitForTimeout(800); x = await paint(p); check('night: the Guide page is dark', isDark(x), JSON.stringify(x));
  await p.evaluate(() => bkGuideOff());
  check('the choice is stored', await p.evaluate(() => localStorage.getItem('bk-theme') === 'dark'));
  await p.reload(); await p.waitForTimeout(900); await p.evaluate(() => { document.documentElement.classList.add('bk-auth-ok'); });
  x = await paint(p); check('after a reload the choice holds (still night on a light device)', isDark(x) && x.attr === 'dark', JSON.stringify(x));
  await p.click('#bk-theme-btn'); await p.waitForTimeout(800); await show(p, 'Valuation'); x = await paint(p);
  check('clicking again returns to day (editor included) and a moon', isLight(x) && await p.evaluate(() => document.getElementById('bk-theme-btn').getAttribute('data-icon') === 'moon'), JSON.stringify(x));
  await p.evaluate(() => bkTheme.set('auto')); await p.waitForTimeout(500);
  check('"follow the device" clears the choice and the override', await p.evaluate(() => localStorage.getItem('bk-theme') === null && !document.documentElement.getAttribute('data-theme')));
  check('no page errors (light device)', p.errs.length === 0, p.errs.join(' | ')); await p.context().close();

  /* ---- dark device ---- */
  p = await open('dark');
  const d = await p.evaluate(() => document.getElementById('bk-theme-btn').getAttribute('data-icon')); x = await paint(p);
  check('on a dark device it starts dark and shows a sun (click for day)', d === 'sun' && isDark(x), JSON.stringify(x));
  await p.click('#bk-theme-btn'); await p.waitForTimeout(800);
  for (const sh of ['Home', 'Property', 'Valuation', 'Returns', 'Debt', 'Sensitivity', 'IC Memo']) { await show(p, sh); x = await paint(p); check('day on a dark device: ' + sh + ' is light', isLight(x), JSON.stringify(x)); }
  check('icon is a moon in day mode', await p.evaluate(() => document.getElementById('bk-theme-btn').getAttribute('data-icon') === 'moon'));
  await p.evaluate(() => bkTheme.set('auto')); await p.waitForTimeout(600); await show(p, 'Returns'); x = await paint(p);
  check('back to following the device: dark again', isDark(x), JSON.stringify(x));
  check('no page errors (dark device)', p.errs.length === 0, p.errs.join(' | ')); await p.context().close();

  /* ---- the sign-in card is readable in night mode (heading, copy, labels against the card) ---- */
  { const ctx = await b.newContext({ colorScheme: 'dark', viewport: { width: 700, height: 800 } }); const q = await ctx.newPage(); await q.route(/supabase\.co|vercel\.app|fonts\.g|cdn\.jsdelivr/, r => r.abort()); await q.goto('file://' + path.resolve(process.argv[2])); await q.waitForTimeout(600);
    const g = await q.evaluate(() => { const c = (s) => { const e = document.querySelector('#bk-auth-gate ' + s); return e ? getComputedStyle(e).color : null; }; const card = getComputedStyle(document.querySelector('#bk-auth-gate .bk-login-card')).backgroundColor; return { card, h2: c('h2'), p: c('.bk-login-body p'), label: c('label') }; });
    const L = (c) => { const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)/.exec(c); return (0.2126 * m[1] + 0.7152 * m[2] + 0.0722 * m[3]) / 255; };
    check('night sign-in card: heading, copy and labels are clearly lighter than the card', L(g.h2) - L(g.card) > 0.5 && L(g.p) - L(g.card) > 0.4 && L(g.label) - L(g.card) > 0.5, JSON.stringify(g)); await ctx.close(); }

  /* ---- phone ---- */
  p = await open('dark', 390); const ph = await p.evaluate(() => { const e = document.getElementById('bk-theme-btn'), r = e.getBoundingClientRect(); return { vis: r.width > 0 && r.right <= innerWidth && r.left >= 0, w: r.width, over: document.documentElement.scrollWidth > innerWidth + 1 }; });
  check('on a phone the button fits on screen and the page does not scroll sideways', ph.vis && !ph.over, JSON.stringify(ph)); await p.context().close();
  console.log('theme: ' + checks + ' checks, ' + fails + ' failures'); await b.close(); process.exit(fails ? 1 : 0);
})();
