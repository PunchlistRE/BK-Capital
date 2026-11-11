// Investor summary (src/145): the return sensitivity grid. One amber-to-teal scale (owner request 11 Nov; was one blue scale) from the grid's own lowest IRR to its highest, so the grid shows how far the answer moves even when every
// cell beats the hurdle (centred on the hurdle, such a grid was one shade of green); a marker on the cells below the hurdle only when the grid straddles it; the base case outlined
// and equal to the engine's IRR; the same grid on the development summary.
//   node audit/sensitivity_grid_test.js index.html
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); const path = require('path'); const fs = require('fs'); const os = require('os');
const A = require(path.join(__dirname, 'deal.js')), V = require(path.join(__dirname, 'devdeal.js'));
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  let checks = 0, fails = 0; const check = (n, ok, d) => { checks++; if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? '  [' + String(d).slice(0, 400) + ']' : '')); };
  const p = await b.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route(/supabase\.co|vercel\.app|fonts\.g|cdn\.jsdelivr/, r => r.abort()); await p.goto('file://' + path.resolve(process.argv[2])); await p.waitForTimeout(700);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bk-sens-'));
  const grid = async (deal, over) => { const r = await p.evaluate(([d, o]) => { document.documentElement.classList.add('bk-auth-ok'); bkCreateNewDeal(d); const s = bkLoad(); Object.assign(s, d, o || {}); bkSave(s);
      return { html: bkReportHTML(), irr: bkInCase(() => bkMonthlyReturns().irr), hurdle: Number((bkPolicy() || {}).targetIRR) || 0.12 }; }, [deal, over]);
    const f = path.join(tmp, 'g' + Math.random().toString(36).slice(2) + '.html'); fs.writeFileSync(f, r.html); const q = await b.newPage(); await q.goto('file://' + f); await q.waitForTimeout(200);
    const g = await q.evaluate(() => { const t = document.querySelector('table.hm'); if (!t) return null; const lum = (c) => { const m = c.match(/\d+/g).map(Number); return 0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]; };
      const cells = [...t.querySelectorAll('tr')].slice(1).map(tr => [...tr.querySelectorAll('td:not(.row)')].map(td => ({ v: parseFloat(td.textContent.replace(/[^0-9.\-]/g, '')), bg: getComputedStyle(td).backgroundColor, base: td.classList.contains('base'), under: td.classList.contains('under'), mark: !!td.querySelector('i'), outline: getComputedStyle(td).outlineStyle })));
      const flat = [].concat.apply([], cells); return { flat: flat.map(c => Object.assign(c, { L: lum(c.bg) })), key: (t.nextElementSibling && t.nextElementSibling.classList.contains('hm-key')) ? t.nextElementSibling.innerText.replace(/\s+/g, ' ') : '', note: (t.parentElement.querySelector('.note') || {}).textContent || '' }; });
    await q.close(); return Object.assign(r, { g }); };
  const shades = (g) => new Set(g.flat.map(c => c.bg)).size;
  /* owner request 11 Nov: the sensitivity charts use a diverging amber-rust (low) to neutral to teal (high) scale instead of the blue ramp. On that scale green minus red rises with the value,
     so "a higher IRR is never a lighter cell" becomes "a higher IRR is never further toward amber". */
  const gr = (c) => { const m = c.bg.match(/\d+/g).map(Number); return m[1] - m[0]; };
  const ordered = (g) => { const s = g.flat.slice().sort((x, y) => x.v - y.v); for (let i = 1; i < s.length; i++) if (s[i].v > s[i - 1].v + 1e-9 && gr(s[i]) < gr(s[i - 1]) - 1) return false; return true; };
  const LO = [208, 105, 31], MD = [243, 241, 236], HI = [27, 138, 125];
  const onScale = (c) => { const m = c.bg.match(/\d+/g).map(Number); const seg = (a, b) => { let best = 1e9; for (let t = 0; t <= 1.0001; t += 0.01) { const d = Math.hypot(a[0] + (b[0] - a[0]) * t - m[0], a[1] + (b[1] - a[1]) * t - m[1], a[2] + (b[2] - a[2]) * t - m[2]); if (d < best) best = d; } return best; }; return Math.min(seg(LO, MD), seg(MD, HI)) < 6; };
  const base = (r) => { const c = r.g.flat.filter(x => x.base); return c.length === 1 && Math.abs(c[0].v - Math.round(r.irr * 1000) / 10) < 0.051 && c[0].outline !== 'none'; };

  /* every cell above the hurdle: the case the hurdle-centred scale painted one green */
  const hi = await grid(A, { exitCap: 0.035 });
  check('every cell beats the hurdle, and the grid still shows its spread: at least 15 shades over the 25 cells, a higher IRR never further toward amber, no hurdle markers, the key gives the lowest and highest IRR', hi.g && hi.g.flat.every(c => c.v / 100 >= hi.hurdle) && shades(hi.g) >= 15 && ordered(hi.g) && hi.g.flat.every(c => !c.under && !c.mark) && /Every cell meets/.test(hi.g.note) && hi.g.key.indexOf(Math.min(...hi.g.flat.map(c => c.v)).toFixed(2) + '%') >= 0 && hi.g.key.indexOf(Math.max(...hi.g.flat.map(c => c.v)).toFixed(2) + '%') >= 0, JSON.stringify({ n: shades(hi.g), key: hi.g.key }));
  check('the base cell is outlined and is the engine\'s levered IRR', base(hi), JSON.stringify(hi.g.flat.filter(x => x.base)));
  /* every cell below the hurdle */
  const lo = await grid(A, {});
  check('every cell misses the hurdle: the same spread of shades, no markers, and one sentence saying no cell reaches it', lo.g.flat.every(c => c.v / 100 < lo.hurdle) && shades(lo.g) >= 15 && ordered(lo.g) && lo.g.flat.every(c => !c.mark) && /No cell reaches/.test(lo.g.note) && base(lo), JSON.stringify({ n: shades(lo.g), note: lo.g.note.slice(0, 160) }));
  /* a grid that straddles the hurdle */
  let mx = null; for (const ec of [0.04, 0.0425, 0.045, 0.0475, 0.05, 0.0525]) { const r = await grid(A, { exitCap: ec }); const below = r.g.flat.filter(c => c.v / 100 < r.hurdle).length; if (below > 0 && below < 25) { mx = r; break; } }
  check('a grid that straddles the hurdle marks exactly the cells below it, and the note counts them', !!mx && mx.g.flat.every(c => c.mark === (c.v / 100 < mx.hurdle)) && mx.g.note.indexOf('marks the ' + mx.g.flat.filter(c => c.mark).length + ' cell') >= 0 && ordered(mx.g) && base(mx), mx ? JSON.stringify({ marked: mx.g.flat.filter(c => c.mark).length, note: mx.g.note.slice(0, 160) }) : 'no straddling case');
  /* development summary */
  const dv = await grid(V, {});
  check('the development summary uses the same grid: shade spread, key, base cell outlined', dv.g && shades(dv.g) >= 15 && ordered(dv.g) && !!dv.g.key && base(dv), dv.g ? JSON.stringify({ n: shades(dv.g), key: dv.g.key }) : 'no grid');
  check('every fill is on the one amber-to-neutral-to-teal scale (no other colors, and a small marker only)', [hi, lo, mx, dv].filter(Boolean).every(r => r.g.flat.every(onScale)));
  check('no page errors', errs.length === 0, errs.join(' | '));
  console.log(checks + ' checks, ' + fails + ' failures'); await b.close(); process.exit(fails ? 1 : 0);
})();
