// Field widths: one width per kind of value box, on every Property Editor page (src/188-bk-field-widths.js, src/189-bk-field-widths.css).
// A percent box is as wide as every other percent box, a dollar box as every other dollar box, calculated read-only values included; text, choices and the rest likewise.
// The kind is checked two independent ways: from the box's own marker (data-bk-w) and from the unit written beside it ("%" or "$ / ...").
//   node audit/field_widths_test.js index.html
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); const path = require('path');
const A = require(path.join(__dirname, 'deal.js')), V = require(path.join(__dirname, 'devdeal.js'));
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  let checks = 0, fails = 0; const check = (n, ok, d) => { checks++; if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? '  [' + String(d).slice(0, 400) + ']' : '')); };
  const open = async (w, deal) => { const p = await (await b.newContext({ viewport: { width: w, height: w < 600 ? 844 : 1000 } })).newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
    await p.route(/supabase\.co|vercel\.app|fonts\.g|cdn\.jsdelivr/, r => r.abort()); await p.goto('file://' + path.resolve(process.argv[2])); await p.waitForTimeout(700);
    await p.evaluate((d) => { document.documentElement.classList.add('bk-auth-ok'); bkCreateNewDeal(d); const s = bkLoad(); Object.assign(s, d, { commercialArea: 4895, miscIncome: [{ name: 'CAM charges', amount: 1750.95, freq: 'Monthly' }, { name: 'Laundry Income', amount: 107.43, freq: 'Monthly' }] }); bkSave(s); }, deal); return p; };
  /* every box of every Property Editor sub-tab: its marker, width, and the unit written beside it */
  const SCAN = async (p) => p.evaluate(async () => { const out = [], tabs = bkEditorTabs.map(t => [t.id, t.subs.map(x => x[0])]);
    for (const [tab, subs] of tabs) for (const sub of subs) { bkEdSub(tab, sub); await new Promise(r => setTimeout(r, 140)); const v = document.querySelector('#viewport');
      v.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=hidden]):not([type=date]),select,span.ae-ro').forEach(e => { const r = e.getBoundingClientRect(); if (r.width < 2) return;
        const u = e.nextElementSibling && /ae-unit/.test(e.nextElementSibling.className || '') ? e.nextElementSibling.textContent.trim() : '', form = !!e.closest('.ae-form'), grid = !!e.closest('table.ae-grid');
        out.push({ at: tab + '>' + sub, k: e.getAttribute('data-bk-w') || '', w: Math.round(r.width), h: Math.round(r.height), u, form, grid, tag: e.tagName.toLowerCase(), cls: String(e.className || '').split(/\s+/)[0] }); }); }
    return out; });
  const rows = []; for (const [dk, deal] of [['acq', A], ['dev', V]]) { const p = await open(1440, deal); const r = await SCAN(p); r.forEach(x => rows.push(Object.assign({ deck: dk }, x))); if (dk === 'acq') var pErr = p.errs.slice(); await p.close(); }
  const kinds = {}; rows.forEach(x => { if (x.k) (kinds[x.k] = kinds[x.k] || new Set()).add(x.w); });
  check('Property Editor: every box of one kind has one width, on all ' + new Set(rows.map(x => x.at)).size + ' sub-tabs of both decks (' + rows.length + ' boxes)', Object.keys(kinds).length >= 4 && Object.values(kinds).every(s => s.size === 1), JSON.stringify(Object.fromEntries(Object.entries(kinds).map(([k, s]) => [k, [...s]]))));
  const unk = rows.filter(x => (x.form || x.grid) && !x.k && !(x.tag === 'input' && x.w > 340));
  check('Property Editor: every box in a form or a grid has a kind (none is left at a width of its own)', unk.length === 0, unk.slice(0, 4).map(x => x.at + ' ' + x.tag + '.' + x.cls + ' ' + x.w).join('; '));
  const pc = rows.filter(x => x.form && /^%/.test(x.u)), dl = rows.filter(x => x.form && /^\$/.test(x.u));
  check('a percent is as wide as every other percent in the forms (' + pc.length + ' boxes, inputs and calculated values alike)', pc.length >= 20 && new Set(pc.map(x => x.w)).size === 1, [...new Set(pc.map(x => x.w))].join());
  check('a dollar amount is as wide as every other dollar amount in the forms (' + dl.length + ' boxes, inputs and calculated values alike)', dl.length >= 8 && new Set(dl.map(x => x.w)).size === 1, [...new Set(dl.map(x => x.w))].join());
  const sels = rows.filter(x => x.form && x.tag === 'select'), hts = rows.filter(x => x.form && x.k);
  check('every drop-down in a form is as wide as every other (' + sels.length + ')', sels.length >= 10 && new Set(sels.map(x => x.w)).size === 1, [...new Set(sels.map(x => x.w))].join());
  check('every box in a form is the same height, calculated values included (' + hts.length + ')', new Set(hts.map(x => x.h)).size === 1, [...new Set(hts.map(x => x.h))].join());
  /* a wide screen no longer stretches a grid across it: the box is the column */
  const w = await open(1800, A); const grid = await w.evaluate(async () => { bkEdSub('Revenues', 'misc'); await new Promise(r => setTimeout(r, 300)); const t = document.querySelector('#viewport table.ae-grid'), p = t.closest('.ae-panel'); return { t: Math.round(t.getBoundingClientRect().width), p: Math.round(p.getBoundingClientRect().width) }; });
  check('a wide screen does not stretch the Miscellaneous income grid across it (the grid is as wide as its boxes)', grid.t < grid.p * 0.7, JSON.stringify(grid)); await w.close();
  /* typing does not change a box */
  const t = await open(1440, A); const typed = await t.evaluate(async () => { bkEdSub('Market', 'infl'); await new Promise(r => setTimeout(r, 200)); const e = document.getElementById('ae-def-rent'), before = Math.round(e.getBoundingClientRect().width); e.value = '4.5'; e.dispatchEvent(new Event('change', { bubbles: true })); await new Promise(r => setTimeout(r, 300));
    const a = document.getElementById('ae-def-rent'); return { before, after: Math.round(a.getBoundingClientRect().width), saved: bkLoad().rentGrowth }; });
  check('typing a rate keeps the percent box at its width and saves the figure (4.5% is saved as 0.045)', typed.before === typed.after && Math.abs(typed.saved - 0.045) < 1e-12, JSON.stringify(typed)); await t.close();
  /* the phone: boxes never push a page past the screen */
  const ph = await open(390, A); const over = await ph.evaluate(async () => { const bad = []; for (const t of bkEditorTabs) for (const s of t.subs) { bkEdSub(t.id, s[0]); await new Promise(r => setTimeout(r, 120)); const W = document.documentElement.clientWidth, o = document.documentElement.scrollWidth - W; if (o > 1) bad.push(t.id + '>' + s[0] + ' +' + o); } return bad; });
  check('phone: no Property Editor page scrolls sideways', over.length === 0, over.slice(0, 5).join('; '));
  check('no page errors', pErr.length === 0 && ph.errs.length === 0, pErr.concat(ph.errs).slice(0, 2).join(' | ')); await ph.close();
  console.log(checks + ' checks, ' + fails + ' failures'); await b.close(); process.exit(fails ? 1 : 0);
})();
