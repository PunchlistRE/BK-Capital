/* CONTROL NAMES (polish group A). Every input, select and text area on every sheet, on both test decks, has a name a screen reader can say (a label, aria-label, aria-labelledby or title),
   and the names read as "row label, column heading" or the form label printed beside the control. Read-only: nothing here changes the app, a calculation or deal data.
     node audit/control_names_test.js index.html */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); const path = require('path'); const A = require(path.join(__dirname, 'deal.js')), V = require(path.join(__dirname, 'devdeal.js'));
const HTML = path.resolve(process.argv[2] || 'index.html'), FIXED = Date.UTC(2026, 10, 13, 12, 0, 0);
let checks = 0, fails = 0; const check = (n, ok, d) => { checks++; if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? '  [' + String(d).slice(0, 300) + ']' : '')); };
(async () => { const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
 for (const [dn, deck] of [['acquisition', A], ['development', V]]) { const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }), p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route(/supabase\.co|vercel\.app|fonts\.g|cdn\.jsdelivr/, r => r.abort()); await p.addInitScript(F => { const D = Date; class FD extends D { constructor(...a) { if (a.length) super(...a); else super(F); } static now() { return F; } } window.Date = FD; }, FIXED);
  await p.goto('file://' + HTML); await p.waitForTimeout(700); await p.evaluate(d => { document.documentElement.classList.add('bk-auth-ok'); bkCreateNewDeal(d); }, deck); await p.waitForTimeout(500);
  const sheets = await p.evaluate(() => { const o = []; document.querySelectorAll('.rail [data-sheet]').forEach(e => { const s = e.getAttribute('data-sheet'); if (s && o.indexOf(s) < 0) o.push(s); }); return o; }); let total = 0, bad = [], odd = [], named = 0;
  for (const s of sheets) { await p.evaluate(x => showSheet(x), s); await p.waitForTimeout(500);
   const r = await p.evaluate(() => { const has = e => e.getAttribute('aria-label') || e.getAttribute('aria-labelledby') || e.getAttribute('title') || (e.id && document.querySelector('label[for="' + e.id + '"]')) || e.closest('label');
    const all = [].slice.call(document.querySelectorAll('#viewport input:not([type=hidden]),#viewport select,#viewport textarea')).filter(e => e.getBoundingClientRect().width > 0 && !e.closest('.bk-pt-pane.bk-pt-hide'));
    return { n: all.length, bad: all.filter(e => !has(e)).map(e => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '')), odd: all.filter(e => e.getAttribute('data-bk-aria')).map(e => e.getAttribute('aria-label')).filter(t => t.length > 80 || /undefined|NaN|\[object/.test(t)) }; });
   total += r.n; if (r.bad.length) bad.push(s + ': ' + r.bad.slice(0, 3).join(', ')); odd.push.apply(odd, r.odd); }
  check(dn + ': every control on every sheet has a name (' + total + ' controls, ' + sheets.length + ' sheets)', bad.length === 0, bad.slice(0, 5).join(' ; '));
  check(dn + ': no generated name is over 80 characters or contains undefined / NaN / [object]', odd.length === 0, odd.slice(0, 3).join(' | '));
  /* a spot check that the names say the right thing */
  await p.evaluate(() => showSheet('Expenses')); await p.waitForTimeout(500); const ex = await p.evaluate(() => [].slice.call(document.querySelectorAll('#viewport [aria-label]')).map(e => e.getAttribute('aria-label')));
  check(dn + ': Expenses names read "row label, column heading"', ex.indexOf('Real Estate Taxes, Amount') >= 0 && ex.indexOf('Real Estate Taxes, Frequency') >= 0, ex.filter(t => /Taxes/.test(t)).join(' | '));
  check(dn + ': no page errors', errs.length === 0, errs.join(' | ')); await ctx.close(); }
 console.log('control names: ' + checks + ' checks, ' + fails + ' failures'); await b.close(); process.exit(fails ? 1 : 0); })();
