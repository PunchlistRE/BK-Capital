// Header, second row: the section's pages are tabs, the same shape as the section tabs above them but light (src/182-bk-palette.css).
// Checks the shape (rounded top corners, a border, no bottom edge, the same radius as the section tabs), that the row is lighter than the section tabs, that the open page is marked
// (white, an accent edge, aria-current, no line under it), that text is readable on every tab in the light and dark themes, that pages open when clicked, and that nothing is cut off on a phone.
//   node audit/subtabs_test.js index.html
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); const path = require('path');
const A = require(path.join(__dirname, 'deal.js'));
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  let checks = 0, fails = 0; const check = (n, ok, d) => { checks++; if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? '  [' + String(d).slice(0, 420) + ']' : '')); };
  const open = async (w, scheme, sheet) => { const ctx = await b.newContext({ viewport: { width: w, height: w < 600 ? 844 : 900 }, colorScheme: scheme }), p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
    await p.route(/supabase\.co|vercel\.app|fonts\.g|cdn\.jsdelivr/, r => r.abort()); await p.goto('file://' + path.resolve(process.argv[2])); await p.waitForTimeout(700);
    await p.evaluate((d) => { document.documentElement.classList.add('bk-auth-ok'); bkCreateNewDeal(d); const s = bkLoad(); Object.assign(s, d); bkSave(s); }, A);
    await p.evaluate(async (sh) => { showSheet(sh); await new Promise(r => setTimeout(r, 600)); }, sheet); return p; };
  /* colours as numbers: composite a background over its ancestors, then WCAG luminance and contrast */
  const MEASURE = () => {
    const parse = (c) => { const m = String(c).match(/rgba?\(([^)]+)\)/); if (!m) return [0, 0, 0, 0]; const a = m[1].split(',').map(Number); return [a[0], a[1], a[2], a.length > 3 ? a[3] : 1]; };
    const over = (top, bot) => { const a = top[3] + bot[3] * (1 - top[3]); return a === 0 ? [0, 0, 0, 0] : [(top[0] * top[3] + bot[0] * bot[3] * (1 - top[3])) / a, (top[1] * top[3] + bot[1] * bot[3] * (1 - top[3])) / a, (top[2] * top[3] + bot[2] * bot[3] * (1 - top[3])) / a, a]; };
    const bg = (el) => { let c = parse(getComputedStyle(el).backgroundColor), n = el.parentElement; while (c[3] < 1 && n) { c = over(c, parse(getComputedStyle(n).backgroundColor)); n = n.parentElement; } return c.slice(0, 3); };
    const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
    const cr = (a, b2) => { const x = lum(a), y = lum(b2); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    const tab = (el) => { const cs = getComputedStyle(el), fill = bg(el), ink = parse(cs.color).slice(0, 3); return { fill, lum: lum(fill), cr: cr(ink, fill), fw: Number(cs.fontWeight), radius: parseFloat(cs.borderTopLeftRadius), bt: parseFloat(cs.borderTopWidth), bb: parseFloat(cs.borderBottomWidth), bl: parseFloat(cs.borderLeftWidth), btc: cs.borderTopColor, bbc: cs.borderBottomColor, h: Math.round(el.getBoundingClientRect().height), text: el.textContent.trim() }; };
    const top = document.querySelector('.tabnav-primary .grp-btn:not(.on)'), subs = [...document.querySelectorAll('.bk-ribbon .rb-t')], on = document.querySelector('.bk-ribbon .rb-t.on'), off = subs.find(e => !e.classList.contains('on'));
    return { top: top ? tab(top) : null, on: on ? tab(on) : null, off: off ? tab(off) : null, all: subs.map(tab), names: subs.map(e => e.textContent.trim()), ariaOn: on ? on.getAttribute('aria-current') : null, n: subs.length };
  };
  /* light theme, desktop, the Property section (seven pages) */
  let p = await open(1440, 'light', 'Revenues'); let m = await p.evaluate(MEASURE);
  check('second row: a tab for every page of the section, the same names as before (Property, Market, Revenues, Expenses, Tenants, Investment, Valuation)', m.n === 7 && m.names.join('|') === 'Property|Market|Revenues|Expenses|Tenants|Investment|Valuation', m.names.join('|'));
  check('tab shape: rounded top corners at the same radius as the section tabs, a 1px border on the sides and top, no bottom edge on an inactive tab', m.off.radius >= 3 && m.off.radius === m.top.radius && m.off.bt === 1 && m.off.bl === 1 && m.off.bb === 0, JSON.stringify([m.off.radius, m.top.radius, m.off.bt, m.off.bl, m.off.bb]));
  check('lighter than the section tabs: an inactive page tab is much lighter than an inactive section tab (' + m.off.lum.toFixed(2) + ' against ' + m.top.lum.toFixed(2) + ')', m.off.lum > m.top.lum + 0.4, JSON.stringify([m.off.lum, m.top.lum]));
  check('the open page is marked: aria-current, white, bold, an accent edge 2px across its top, no line under it; and it differs from an inactive tab', m.ariaOn === 'page' && m.on.fill.join() === '255,255,255' && m.on.fw >= 600 && m.on.bt === 2 && m.on.btc !== m.off.btc && m.on.bbc === 'rgb(255, 255, 255)' && m.on.fill.join() !== m.off.fill.join(), JSON.stringify(m.on));
  check('text is readable on every page tab (4.5 to 1 or better), open and not', m.all.every(t => t.cr >= 4.5), m.all.map(t => t.cr.toFixed(1)).join(','));
  check('a tab is tall enough to tap (28px or more)', m.all.every(t => t.h >= 28), m.all.map(t => t.h).join(','));
  /* the pages still open */
  const go = await p.evaluate(async () => { const t = [...document.querySelectorAll('.bk-ribbon .rb-t')].find(e => e.textContent.trim() === 'Expenses'); t.click(); await new Promise(r => setTimeout(r, 700)); const on = document.querySelector('.bk-ribbon .rb-t.on'); return { on: on && on.textContent.trim(), crumb: (document.querySelector('#viewport .title-block h2, #viewport .ae-title, #viewport h2') || {}).textContent }; });
  check('clicking a page tab opens that page and marks it open', go.on === 'Expenses', JSON.stringify(go));
  const errs = p.errs.slice(); await p.close();

  /* dark theme: readable, the open page still differs, and the edge is the dark accent */
  p = await open(1440, 'dark', 'Revenues'); m = await p.evaluate(MEASURE);
  check('dark theme: text is readable on every page tab, the open page is not the same fill as an inactive one, and its bottom edge is its own fill (it joins the page)', m.all.every(t => t.cr >= 4.5) && m.on.fill.join() !== m.off.fill.join() && m.on.bbc !== m.on.btc, JSON.stringify([m.all.map(t => t.cr.toFixed(1)).join(','), m.on.fill, m.off.fill, m.on.btc, m.on.bbc]));
  await p.close();
  p = await open(1440, 'light', 'Revenues'); await p.evaluate(() => document.querySelector('#bk-theme-btn, .bk-theme-btn').click()); await p.waitForTimeout(400); const th = await p.evaluate(() => document.documentElement.getAttribute('data-theme')); m = await p.evaluate(MEASURE);
  check('the in-app theme button (the operating system stays light) gives the same: dark, readable, and the open page marked (' + th + ')', th === 'dark' && m.all.every(t => t.cr >= 4.5) && m.on.fill.join() !== m.off.fill.join() && m.ariaOn === 'page', th + ' ' + m.all.map(t => t.cr.toFixed(1)).join(',')); await p.close();

  /* a section with many pages wraps; and the phone: nothing cut off, nothing pushes the page sideways */
  p = await open(1440, 'light', 'Deal Underwrite'); m = await p.evaluate(MEASURE);
  check('Underwrite (many pages): every page has a tab and one is open', m.n >= 8 && m.ariaOn === 'page', m.names.join('|')); await p.close();
  p = await open(390, 'light', 'Deal Underwrite'); const ph = await p.evaluate(() => { const W = document.documentElement.clientWidth, subs = [...document.querySelectorAll('.bk-ribbon .rb-t')]; const cut = subs.filter(e => e.scrollWidth > e.clientWidth + 1).map(e => e.textContent.trim()), right = Math.max(...subs.map(e => e.getBoundingClientRect().right)), rows = new Set(subs.map(e => Math.round(e.getBoundingClientRect().top))).size; return { over: document.documentElement.scrollWidth - W, cut, right, W, rows, n: subs.length }; });
  check('phone: the page tabs wrap onto rows, none is cut off, none runs past the screen, and the page does not scroll sideways', ph.rows >= 2 && ph.cut.length === 0 && ph.right <= ph.W + 1 && ph.over <= 1, JSON.stringify(ph));
  const pm = await p.evaluate(MEASURE); check('phone: tabs keep the shape and 28px height', pm.all.every(t => t.h >= 28 && t.radius >= 3), pm.all.map(t => t.h + '/' + t.radius).join(',')); await p.close();
  /* print: the row is not printed */
  p = await open(1440, 'light', 'Revenues'); await p.emulateMedia({ media: 'print' }); const pr = await p.evaluate(() => getComputedStyle(document.querySelector('.bk-ribbon')).display);
  check('print: the second row is not printed', pr === 'none', pr); await p.close();
  check('no page errors', errs.length === 0, errs.slice(0, 2).join(' | '));
  console.log(checks + ' checks, ' + fails + ' failures'); await b.close(); process.exit(fails ? 1 : 0);
})();
