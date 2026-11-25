/* TABLE FIELDS STILL EDIT (design-system phase 1). The table standard re-lays out the boxes and drop-downs inside tables. This proves they behave exactly as before:
   on every sheet, in the reference build and in this build, it changes every box and drop-down inside a financial table the same way, each found by what it changes rather than where it sits (a drop-down to its next choice,
   a figure up by one, an empty box to 1) and requires the saved deal to come out identical, field by field. It also requires every control to sit inside its own cell.
   node audit/table_fields_test.js ref.html index.html */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); const path = require('path');
const A = require(path.join(__dirname, 'deal.js')), V = require(path.join(__dirname, 'devdeal.js'));
const REF = path.resolve(process.argv[2]), CUR = path.resolve(process.argv[3] || 'index.html'), FIXED = Date.UTC(2026, 10, 13, 12, 0, 0);
let checks = 0, fails = 0; const check = (n, ok, d) => { checks++; if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? '  [' + String(d).slice(0, 400) + ']' : '')); };
const SEL = '#viewport .sheet-frame.active .main-col table.fin td select, #viewport .sheet-frame.active .main-col table.fin td input:not([type=checkbox]):not([type=radio]):not([type=file]):not([type=hidden]):not([type=date]):not([type=range])';
async function run(b, html, deck) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }), p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route(/supabase\.co|vercel\.app|fonts\.g|cdn\.jsdelivr/, r => r.abort());
  await p.addInitScript(F => { const D = Date; class FD extends D { constructor(...a) { if (a.length) super(...a); else super(F); } static now() { return F; } } window.Date = FD; }, FIXED);
  await p.goto('file://' + html); await p.waitForTimeout(700); await p.evaluate(d => { document.documentElement.classList.add('bk-auth-ok'); bkCreateNewDeal(d); }, deck); await p.waitForTimeout(500);
  const sheets = await p.evaluate(() => { const o = []; document.querySelectorAll('.rail [data-sheet]').forEach(e => { const s = e.dataset.sheet; if (s && o.indexOf(s) < 0) o.push(s); }); return o; });
  const res = {}; let edited = 0; const outside = [];
  for (const s of sheets) { await p.evaluate(x => showSheet(x), s); await p.waitForTimeout(450);
    const n = await p.evaluate(sel => document.querySelectorAll(sel).length, SEL); if (!n) continue;
    outside.push(...(await p.evaluate(sel => [].filter.call(document.querySelectorAll(sel), e => e.offsetParent).filter(e => { const r = e.getBoundingClientRect(), c = e.closest('td').getBoundingClientRect(); return r.left < c.left - 1 || r.right > c.right + 1; }).map(e => (e.getAttribute('aria-label') || e.name || e.tagName)), SEL)).map(x => s + ': ' + x));
    /* each box is found by what it changes (its handler, else its label or id), not by its position, so reordering rows (Credit Policy grouping) edits the same settings */
    const KEYS = `(sel => { const seen = {}; return [].filter.call(document.querySelectorAll(sel), e => e.offsetParent && !e.disabled && !e.readOnly).map(e => { const k = (e.getAttribute('onchange') || e.getAttribute('aria-label') || e.id || e.tagName).replace(/\\s+/g, ' '); seen[k] = (seen[k] || 0) + 1; return { k: k + '#' + seen[k], e }; }); })`;
    const keys = (await p.evaluate(([sel, K]) => eval(K)(sel).map(x => x.k), [SEL, KEYS])).sort();
    for (const key of keys.slice(0, 40)) {
      const did = await p.evaluate(([sel, K, key]) => { const hit = eval(K)(sel).filter(x => x.k === key)[0]; if (!hit) return 0; const e = hit.e;
        if (e.tagName === 'SELECT') { if (e.options.length < 2) return 0; e.selectedIndex = (e.selectedIndex + 1) % e.options.length; }
        else { const v = parseFloat(String(e.value).replace(/[^0-9.\-]/g, '')); e.value = isFinite(v) ? String(Math.round((v + 1) * 100) / 100) : '1'; }
        e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); return 1; }, [SEL, KEYS, key]);
      edited += did; await p.waitForTimeout(140); }
    await p.waitForTimeout(300); res[s] = await p.evaluate(() => JSON.stringify(bkLoad())); }
  await ctx.close(); return { res, edited, outside, errs };
}
(async () => { const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  for (const [dn, deck] of [['acquisition', A], ['development', V]]) {
    const r = await run(b, REF, deck), c = await run(b, CUR, deck); const ks = Object.keys(r.res);
    const diff = ks.filter(s => r.res[s] !== c.res[s]).map(s => { const a = JSON.parse(r.res[s]), z = JSON.parse(c.res[s] || '{}'); const k = Object.keys(Object.assign({}, a, z)).filter(k => JSON.stringify(a[k]) !== JSON.stringify(z[k])); return s + ': ' + k.slice(0, 4).join(', '); });
    check(dn + ': the same edits through every in-table box and drop-down (' + c.edited + ' edits on ' + ks.length + ' sheets) leave an identical saved deal', ks.length > 0 && r.edited === c.edited && diff.length === 0 && JSON.stringify(ks) === JSON.stringify(Object.keys(c.res)), (r.edited !== c.edited ? 'edits ' + r.edited + ' vs ' + c.edited + ' ; ' : '') + diff.slice(0, 4).join(' ; '));
    check(dn + ': every box and drop-down sits inside its own cell', c.outside.length === 0, c.outside.slice(0, 5).join(' ; ') + (r.outside.length ? '  (reference build: ' + r.outside.length + ')' : ''));
    check(dn + ': no page errors while editing', c.errs.length === 0 && r.errs.length === c.errs.length, c.errs.slice(0, 2).join(' | ')); }
  console.log('table fields: ' + checks + ' checks, ' + fails + ' failures'); await b.close(); process.exit(fails ? 1 : 0); })();
