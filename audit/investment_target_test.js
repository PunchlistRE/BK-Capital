// Investment Target (src/204), Debt > Compare: required annual return = (target / capital)^(1 / years) - 1 through the valuation engine's bkValCagr; the page is in the Compare group beside the Financing Lab;
// the inputs sync (box and slider) and recompute in place; "use this deal's equity" and "total distributions and hold" take the deal's own figures; invalid inputs give a message, never NaN;
// the growth path ends on the target; saved targets are append-only on the deal; the page is usable on a phone and in the dark theme.
//   node audit/investment_target_test.js index.html
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); const path = require('path');
const A = require(path.join(__dirname, 'deal.js')), V = require(path.join(__dirname, 'devdeal.js'));
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  let checks = 0, fails = 0; const check = (n, ok, d) => { checks++; if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? '  [' + String(d).slice(0, 380) + ']' : '')); };
  const near = (a, c, tol) => a != null && c != null && isFinite(a) && isFinite(c) && Math.abs(a - c) <= (tol == null ? 1 : tol);
  const open = async (deal, w, theme) => { const ctx = await b.newContext(w && w < 500 ? { viewport: { width: w, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: w || 1440, height: 1000 } }); const p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
    await p.route(/supabase\.co|vercel\.app|fonts\.g|cdn\.jsdelivr/, r => r.abort()); await p.goto('file://' + path.resolve(process.argv[2])); await p.waitForTimeout(700);
    await p.evaluate(([d, th]) => { document.documentElement.classList.add('bk-auth-ok'); bkCreateNewDeal(d); const s = bkLoad(); Object.assign(s, d); bkSave(s); try { localStorage.removeItem('bkcapital.target.ui.v1'); } catch (e) {} if (th) document.documentElement.setAttribute('data-theme', th); }, [deal, theme]); return p; };
  const show = (p) => p.evaluate(async () => { showSheet('Investment Target'); await new Promise(r => setTimeout(r, 600)); });
  const read = (p) => p.evaluate(() => ({ rate: document.getElementById('bk-tg-rate').textContent, mult: document.getElementById('bk-tg-mult').textContent, gain: document.getElementById('bk-tg-gain').textContent, cap: document.getElementById('bk-tg-capital').value, tgt: document.getElementById('bk-tg-target').value, yrs: document.getElementById('bk-tg-years').value, ex: document.getElementById('bk-tg-explain').textContent, path: [...document.querySelectorAll('#bk-tg-path tr')].map(tr => [...tr.children].map(td => td.textContent.trim())) }));

  let p = await open(A); await show(p); let R = await read(p);
  check('the page is in the Debt tab, Compare group, beside the Financing Lab and Financing Compare', await p.evaluate(() => { const g = GROUPS.find(x => x.sheets.indexOf('Investment Target') >= 0); return !!g && g.sheets.indexOf('Financing Lab') >= 0 && g.sheets.indexOf('Financing Compare') >= 0 && !!RENDERERS['Investment Target']; }));
  check('the defaults reproduce the stated example: $250,000 to $1,000,000 over 10 years needs 14.87% a year, 4.00x, $75,000 a year of simple gain', R.rate === '14.87%' && R.mult === '4.00x' && R.gain === '$75,000' && R.cap === '250,000' && R.tgt === '1,000,000' && R.yrs === '10', JSON.stringify(R));
  check('the growth path starts at the capital and ends exactly on the target', R.path.length === 11 && R.path[0][1] === '$250,000' && R.path[10][1] === '$1,000,000', JSON.stringify([R.path[0], R.path[10]]));
  /* typing and sliding keep the box and the slider in step and recompute in place (no page reload) */
  await p.evaluate(() => { const el = document.getElementById('bk-tg-capital'); el.value = '400,000'; el.onchange(); const t = document.getElementById('bk-tg-target-r'); t.value = 2000000; t.oninput(); const y = document.getElementById('bk-tg-years'); y.value = '7'; y.onchange(); });
  R = await read(p); const want = Math.pow(2000000 / 400000, 1 / 7) - 1; const sl = await p.evaluate(() => [document.getElementById('bk-tg-capital-r').value, document.getElementById('bk-tg-target').value, document.getElementById('bk-tg-years-r').value]);
  check('typing the capital, sliding the target and typing the years recompute the required return ((2,000,000 / 400,000)^(1/7) - 1) and keep each box and slider in step', R.rate === (want * 100).toFixed(2) + '%' && R.mult === '5.00x' && sl[0] === '400000' && sl[1] === '2,000,000' && sl[2] === '7', JSON.stringify([R.rate, (want * 100).toFixed(2), sl]));
  /* a non-whole period and a target below the capital */
  await p.evaluate(() => { const y = document.getElementById('bk-tg-years'); y.value = '2.5'; y.onchange(); }); R = await read(p);
  check('a fractional period works: whole years then the exact period end on the target (2.5 years: years 0, 1, 2, then 2.5)', /%$/.test(R.rate) && R.path.length === 4 && R.path[3][0] === 'Year 2.5' && R.path[3][1] === '$2,000,000' && R.path[2][1] !== '$2,000,000', JSON.stringify(R.path));
  await p.evaluate(() => { const t = document.getElementById('bk-tg-target'); t.value = '300,000'; t.onchange(); const y = document.getElementById('bk-tg-years'); y.value = '5'; y.onchange(); }); R = await read(p);
  check('a target below the capital needs a negative return and says so (no NaN)', /^-/.test(R.rate) && !/NaN/.test(JSON.stringify(R)), R.rate);
  await p.evaluate(() => { const c = document.getElementById('bk-tg-capital'); c.value = '0'; c.onchange(); }); R = await read(p);
  check('zero capital shows a message and dashes, never NaN or Infinity', R.rate === '-' && /greater than zero/.test(R.ex) && !/NaN|Infinity/.test(JSON.stringify(R)), JSON.stringify([R.rate, R.ex]));
  await p.evaluate(() => bkTargetReset()); R = await read(p);
  /* the deal's own figures */
  const D = await p.evaluate(() => { const mr = bkMonthlyReturns(), d = bkDebt(), s = bkLoad(); return { eq: Math.round(d.equity), dist: Math.round(mr.dist), hold: Number(s.holdYears), irr: mr.irr }; });
  await p.evaluate(() => bkTargetUseDeal('equity')); R = await read(p);
  check('"Use this deal\'s closing equity" fills the capital with the deal\'s closing equity', R.cap === D.eq.toLocaleString('en-US'), JSON.stringify([R.cap, D.eq]));
  await p.evaluate(() => bkTargetUseDeal('distributions')); R = await read(p);
  const cmp = await p.evaluate(() => document.getElementById('bk-tg-cmp').textContent);
  check('"Use this deal\'s total distributions and hold" fills the target and the years, and the page compares the required return with the deal\'s levered IRR without calling them equivalent', R.tgt === D.dist.toLocaleString('en-US') && R.yrs === String(D.hold) && /levered IRR is/.test(cmp) && /not an equivalence/.test(cmp), JSON.stringify([R.tgt, R.yrs, cmp.slice(0, 140)]));
  /* IRR and CAGR told apart */
  await p.evaluate(() => bkTargetReset()); const IT = await p.evaluate(() => { bkTargetPaint(); const g = [...document.querySelectorAll('#bk-tg-irr tr')].map(tr => [...tr.children].map(td => td.textContent.trim())); return { g, head: document.querySelector('#viewport').textContent, R: bkValReturns() }; });
  check('the page says CAGR, not IRR, and explains the difference with a table: your inputs as one payment have IRR equal to CAGR (14.87%); the deal\'s dated flows do not', /required CAGR \(not IRR\)/.test(IT.head) && IT.g.length === 2 && IT.g[0][1] === '14.87%' && IT.g[0][2] === '14.87%' && IT.g[0][3] === 'equal' && IT.g[1][1] === (IT.R.levIRR * 100).toFixed(2) + '%' && IT.g[1][2] === (IT.R.impliedCagr * 100).toFixed(2) + '%' && /pts$/.test(IT.g[1][3]), JSON.stringify(IT.g));
  /* saved targets: append-only on the deal */
  const sv = await p.evaluate(async () => { bkTargetReset(); document.getElementById('bk-tg-name').value = 'Retire in 10'; bkTargetSave(); await new Promise(r => setTimeout(r, 500)); const a = (bkLoad()._targets || []).map(x => x.id); bkTargetUseDeal('equity'); document.getElementById('bk-tg-name').value = 'Deal equity'; bkTargetSave(); await new Promise(r => setTimeout(r, 500)); const L = bkLoad()._targets; return { a, n: L.length, first: L[0].name, rate: L[0].results.rate, kept: L[0].id === a[0], rows: document.querySelectorAll('#rp-target-saved tbody tr').length }; });
  check('saving appends to the deal (two targets, the first untouched, both listed), each with its inputs, result and engine version', sv.n === 2 && sv.kept && sv.first === 'Retire in 10' && near(sv.rate, Math.pow(4, 0.1) - 1, 1e-9) && sv.rows === 2, JSON.stringify(sv));
  await p.evaluate(() => { const s = bkLoad(); bkTargetLoad(s._targets[0].id); }); R = await read(p);
  check('loading a saved target puts its inputs back', R.cap === '250,000' && R.rate === '14.87%', JSON.stringify(R));
  check('no page errors', p.errs.length === 0, JSON.stringify(p.errs)); await p.context().close();
  /* development deal, phone, dark theme */
  p = await open(V); await show(p); R = await read(p); await p.evaluate(() => bkTargetUseDeal('equity')); const dv = await read(p);
  check('a development deal works too: the closing-equity button uses its total equity contributions', R.rate === '14.87%' && /^[\d,]+$/.test(dv.cap) && dv.cap !== '250,000', JSON.stringify([R.rate, dv.cap])); await p.context().close();
  p = await open(A, 390); await show(p);
  const ph = await p.evaluate(() => ({ over: document.documentElement.scrollWidth > innerWidth + 1, inputs: [...document.querySelectorAll('#viewport input')].filter(i => i.getBoundingClientRect().right > innerWidth + 1).length }));
  check('phone: no sideways scroll and every box fits the screen', !ph.over && ph.inputs === 0, JSON.stringify(ph)); await p.context().close();
  p = await open(A, 1440, 'dark'); await show(p);
  const dk = await p.evaluate(() => { const rgb = (s) => (s.match(/\d+/g) || []).slice(0, 3).map(Number), lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); }; const out = []; ['bk-tg-rate', 'bk-tg-explain'].forEach(id => { const e = document.getElementById(id); let bgEl = e, bg = [0, 0, 0, 0]; while (bgEl) { const m = getComputedStyle(bgEl).backgroundColor.match(/[\d.]+/g); if (m && (m[3] === undefined || Number(m[3]) > 0.5)) { bg = m.slice(0, 3).map(Number); break; } bgEl = bgEl.parentElement; } const fg = rgb(getComputedStyle(e).color), L1 = lum(fg), L2 = lum(bg), r = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05); out.push([id, +r.toFixed(2)]); }); return out; });
  check('dark theme: the result and the explanation have contrast of at least 3:1', dk.every(x => x[1] >= 3), JSON.stringify(dk)); await p.context().close();
  console.log(checks + ' checks, ' + fails + ' failures'); await b.close(); process.exit(fails ? 1 : 0);
})();
