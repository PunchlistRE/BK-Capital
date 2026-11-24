/* TABLE CONTENT INVARIANCE (design-system phase 1). The table standard changes how tables are laid out, never what they say. For every sheet of both decks this
   reads every financial table cell, every status label and every field value in the reference build and in this build, and requires them to be identical:
   the same figures with the same precision, signs and units, the same labels, the same status words, the same values in every box and drop-down.
   A table may gain category rows (Credit Policy grouping, marked data-bk-group); those rows are left out and the order of that table's rows is compared as a set,
   so grouping can reorder settings but never add, drop or change one.  Read-only.   node audit/table_invariance_test.js ref.html index.html */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); const path = require('path');
const A = require(path.join(__dirname, 'deal.js')), V = require(path.join(__dirname, 'devdeal.js'));
const REF = path.resolve(process.argv[2]), CUR = path.resolve(process.argv[3] || 'index.html'), FIXED = Date.UTC(2026, 10, 13, 12, 0, 0);
let checks = 0, fails = 0; const check = (n, ok, d) => { checks++; if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? '  [' + String(d).slice(0, 400) + ']' : '')); };
async function read(b, html, deck) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }), p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route(/supabase\.co|vercel\.app|fonts\.g|cdn\.jsdelivr/, r => r.abort());
  await p.addInitScript(F => { const D = Date; class FD extends D { constructor(...a) { if (a.length) super(...a); else super(F); } static now() { return F; } } window.Date = FD; }, FIXED);
  await p.goto('file://' + html); await p.waitForTimeout(700); await p.evaluate(d => { document.documentElement.classList.add('bk-auth-ok'); bkCreateNewDeal(d); }, deck); await p.waitForTimeout(500);
  const sheets = await p.evaluate(() => { const o = []; document.querySelectorAll('.rail [data-sheet]').forEach(e => { const s = e.dataset.sheet; if (s && o.indexOf(s) < 0) o.push(s); }); return o; });
  const out = {};
  for (const s of sheets) { await p.evaluate(x => showSheet(x), s); await p.waitForTimeout(450);
    out[s] = await p.evaluate(() => { const fr = document.querySelector('#viewport .sheet-frame.active') || document.getElementById('viewport'), norm = x => String(x || '').replace(/\s+/g, ' ').trim();
      const cellText = c => { const x = c.cloneNode(true); x.querySelectorAll('select').forEach(sl => { const o = sl.options[sl.selectedIndex]; sl.replaceWith(document.createTextNode(' ' + (o ? o.text : '') + ' ')); });
        x.querySelectorAll('input').forEach(i => { i.replaceWith(document.createTextNode(' ' + (i.type === 'checkbox' || i.type === 'radio' ? (i.checked ? '[x]' : '[ ]') : i.value) + ' ')); }); return norm(x.textContent); };
      const tables = [].map.call(fr.querySelectorAll('table.fin'), t => { const grouped = t.hasAttribute("data-bk-grouped") || !!t.querySelector("tr[data-bk-group]");
        const rows = [].filter.call(t.rows, r => !r.hasAttribute('data-bk-group')).map(r => [].map.call(r.cells, cellText).join(' | '));
        return { cap: t.caption ? norm(t.caption.textContent) : '', grouped, rows: grouped ? rows.slice().sort() : rows }; });
      const chips = [].map.call(fr.querySelectorAll('.status-chip'), c => norm(c.textContent));
      return { tables, chips }; }); }
  await ctx.close(); return { out, errs };
}
(async () => { const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  for (const [dn, deck] of [['acquisition', A], ['development', V]]) {
    const r = await read(b, REF, deck), c = await read(b, CUR, deck); const sheets = Object.keys(r.out);
    check(dn + ': the same sheets in the same order (' + sheets.length + ')', JSON.stringify(sheets) === JSON.stringify(Object.keys(c.out)), Object.keys(c.out).length);
    let cells = 0, chips = 0; const diffT = [], diffC = [];
    sheets.forEach(s => { const a = r.out[s], z = c.out[s]; if (!z) { diffT.push(s + ': missing'); return; }
      if (a.tables.length !== z.tables.length) diffT.push(s + ': ' + a.tables.length + ' tables vs ' + z.tables.length);
      a.tables.forEach((t, i) => { const u = z.tables[i]; if (!u) return; cells += t.rows.length;
        const ta = u.grouped ? t.rows.slice().sort() : t.rows; if (JSON.stringify(ta) !== JSON.stringify(u.rows)) { const k = ta.findIndex((x, j) => x !== u.rows[j]); diffT.push(s + ' / ' + (t.cap || 'table ' + (i + 1)) + ': "' + ta[k] + '" vs "' + u.rows[k] + '"'); }
        if (t.cap !== u.cap) diffT.push(s + ': caption "' + t.cap + '" vs "' + u.cap + '"'); });
      chips += a.chips.length; if (JSON.stringify(a.chips) !== JSON.stringify(z.chips)) diffC.push(s + ': ' + a.chips.filter((x, j) => x !== z.chips[j]).slice(0, 3).join(', ') + ' vs ' + z.chips.filter((x, j) => x !== a.chips[j]).slice(0, 3).join(', ')); });
    check(dn + ': every table row reads exactly as in the reference build (' + cells + ' rows on ' + sheets.length + ' sheets): figures, precision, units, labels, field values', diffT.length === 0, diffT.slice(0, 4).join(' ; '));
    check(dn + ': every status label is unchanged, word for word and in order (' + chips + ' labels)', diffC.length === 0, diffC.slice(0, 4).join(' ; '));
    check(dn + ': no page errors in this build', c.errs.length === 0, c.errs.join(' | ')); }
  console.log('table content invariance: ' + checks + ' checks, ' + fails + ' failures'); await b.close(); process.exit(fails ? 1 : 0); })();
