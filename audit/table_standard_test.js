/* TABLE STANDARD (design-system phase 1). Every sheet of both decks, at 1440, 1024 and 390 px, in Light and Night:
   (1) nothing in a financial table spills out of its cell (no text, box, drop-down or badge crosses into the next cell), and no column is crushed (no word is wider than its cell);
   (2) on a desktop-width screen every financial table is classified: it has a family (key-value, key-value with notes, ledger, period, matrix) and every column a role;
   (3) a key-value or ledger table scrolls sideways only when even its least widths (longest word, widest figure) exceed its card; tables stacked in one column that have the same column roles line their columns up (the same right edge for each figure, field and status column);
   (4) every status label has a tier (provenance, result, role, not applicable, state, action) so its meaning shows in its form, not only its color.
   Report typesetting (rp-tbl) and the editor's own form grids (ae-grid) keep their own systems and are not part of this standard.  Read-only.
   node audit/table_standard_test.js index.html [--quick] */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); const path = require('path');
const A = require(path.join(__dirname, 'deal.js')), V = require(path.join(__dirname, 'devdeal.js'));
const HTML = path.resolve(process.argv[2] || 'index.html'), QUICK = process.argv.indexOf('--quick') > 0, FIXED = Date.UTC(2026, 10, 13, 12, 0, 0);
let checks = 0, fails = 0; const check = (n, ok, d) => { checks++; if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? '  [' + String(d).slice(0, 500) + ']' : '')); };
const SCAN = () => { const fr = document.querySelector('#viewport .sheet-frame.active') || document.getElementById('viewport'); const R = { over: [], crushed: [], unclassified: [], misaligned: [], untiered: [], wide: [], tables: 0 };
  const inScope = t => t.offsetParent && !t.closest('.rp, .rp-tbl, .ae, .gd-su') && !t.classList.contains('rp-tbl') && !t.classList.contains('ae-grid');
  const tabs = [].filter.call(fr.querySelectorAll('table.fin'), inScope); R.tables = tabs.length; const desk = window.innerWidth > 760;
  tabs.forEach(t => { if (t.getAttribute('data-bk-fam') === 'matrix') return;
    [].forEach.call(t.querySelectorAll('td, th'), c => { const r = c.getBoundingClientRect(); if (r.width < 4 || r.height < 4) return; let what = '';
      [].forEach.call(c.querySelectorAll('*'), k => { if (what || (k.closest('select') && k.tagName !== 'SELECT')) return; const cs = getComputedStyle(k); if (cs.position === 'absolute' || cs.position === 'fixed' || cs.display === 'none') return; const kr = k.getBoundingClientRect(); if (kr.width > 0 && kr.height > 0 && (kr.right > r.right + 1.5 || kr.left < r.left - 1.5)) what = k.tagName.toLowerCase() + ' "' + ((k.value || k.textContent || '').trim().slice(0, 28)) + '"'; });
      if (!what) { const w = document.createTreeWalker(c, NodeFilter.SHOW_TEXT, { acceptNode: n => n.parentElement.closest('select,option') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT }); let n;
        while (!what && (n = w.nextNode())) { if (!n.textContent.trim()) continue; const g = document.createRange(); g.selectNodeContents(n); [].forEach.call(g.getClientRects(), q => { if (!what && q.width > 0 && (q.right > r.right + 1.5 || q.left < r.left - 1.5)) what = 'text "' + n.textContent.trim().slice(0, 28) + '"'; }); } }
      if (what) R.over.push((t.caption ? t.caption.textContent.trim().slice(0, 30) : 'table') + ': ' + what);
      /* a crushed column: a word wider than the cell that holds it breaks letter by letter instead of fitting (text inside a drop-down is excluded) */
      if (!R.cv) R.cv = document.createElement('canvas').getContext('2d'); const cs = getComputedStyle(c), inner = r.width - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
      if (!c.querySelector('input,select,textarea') && cs.whiteSpace !== 'nowrap') { R.cv.font = cs.fontStyle + ' ' + cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
        const words = (c.innerText || '').split(/\s+/).filter(w => w.length > 1 && !/^https?:/.test(w)); const wmax = words.reduce((m, w) => Math.max(m, R.cv.measureText(w).width), 0);
        if (wmax > inner + 2) R.crushed.push((t.caption ? t.caption.textContent.trim().slice(0, 30) : 'table') + ': "' + words.find(w => R.cv.measureText(w).width === wmax) + '" needs ' + Math.round(wmax) + ' has ' + Math.round(inner)); } });
    /* a key-value or ledger table scrolls sideways only when it cannot fit: when even every column at its least (its longest word, its widest figure, 64 px for a field, a note 160 px or its text if shorter)
       is wider than the card. Measured here independently of the standard. Period, matrix and complex tables may scroll. */
    if (desk && /^(kv|kvn|ledger)$/.test(t.getAttribute('data-bk-fam') || '')) { const host = t.parentElement; if (host && host.clientWidth > 60 && t.getBoundingClientRect().width > host.clientWidth + 1.5) {
      if (!R.cv) R.cv = document.createElement('canvas').getContext('2d'); const least = [];
      [].forEach.call(t.rows, row => { if (row.cells.length < 2) return; [].forEach.call(row.cells, (c, k) => { if (c.colSpan > 1) return; const cs = getComputedStyle(c); const pad = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0) + 4; let m = 0;
        if (c.querySelector('input,select')) m = 64 + pad; else { R.cv.font = cs.fontStyle + ' ' + cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily; const x = (c.innerText || '').trim(); const ch = c.querySelector('.status-chip');
          m = (ch ? ch.getBoundingClientRect().width + 18 : 0); (/[A-Za-z]{2}/.test(x) ? x.split(/\s+/) : [x]).forEach(w => { m = Math.max(m, R.cv.measureText(w).width + pad); });
          if (c.getAttribute('data-bk-role') === 'note') m = Math.max(m, Math.min(160, R.cv.measureText(x).width + pad)); }   /* a note keeps 160 px to stay readable, or its whole text if shorter */
        least[k] = Math.max(least[k] || 0, m); }); });
      const need = least.reduce((a, b) => a + (b || 0), 0); if (need + least.length <= host.clientWidth) R.wide.push((t.caption ? t.caption.textContent.trim().slice(0, 30) : 'table') + ' scrolls (' + Math.round(t.getBoundingClientRect().width) + ' > ' + host.clientWidth + ') but fits at ' + Math.round(need)); } }
    if (desk) { const hr = t.tHead && t.tHead.rows.length ? t.tHead.rows[t.tHead.rows.length - 1] : t.rows[0];
      if (!t.getAttribute('data-bk-fam') || (hr && [].some.call(hr.cells, c => !c.getAttribute('data-bk-role')))) R.unclassified.push((t.caption ? t.caption.textContent.trim().slice(0, 30) : 'table') + ' fam=' + t.getAttribute('data-bk-fam')); } });
  if (desk) { const cols = t => { const hr = t.tHead && t.tHead.rows.length ? t.tHead.rows[t.tHead.rows.length - 1] : t.rows[0]; return hr ? [].map.call(hr.cells, c => ({ role: c.getAttribute('data-bk-role'), r: Math.round(c.getBoundingClientRect().right) })) : []; };
    for (let i = 1; i < tabs.length; i++) { const a = tabs[i - 1], b = tabs[i], ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect(); if (Math.abs(ra.left - rb.left) > 2 || Math.abs(ra.width - rb.width) > 2) continue;
      if (a.getAttribute('data-bk-fam') !== b.getAttribute('data-bk-fam') || a.getAttribute('data-bk-fam') === 'matrix') continue; const ca = cols(a), cb = cols(b); if (ca.map(x => x.role).join() !== cb.map(x => x.role).join()) continue;
      ca.forEach((x, k) => { if (/amount|rate|input|choice|status|period|unit/.test(x.role) && Math.abs(x.r - cb[k].r) > 1.5) R.misaligned.push((b.caption ? b.caption.textContent.trim().slice(0, 28) : 'table') + ' col ' + (k + 1) + ' ' + x.role + ' ' + x.r + ' vs ' + cb[k].r); }); } }
  [].forEach.call(fr.querySelectorAll('.status-chip'), c => { if (!c.offsetParent) return; if (!/^(prov|pass|warn|fail|role|na|state|action|neutral)$/.test(c.getAttribute('data-bk-tier') || '')) R.untiered.push(c.textContent.trim().slice(0, 24)); });
  return R; };
(async () => { const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const WIDTHS = QUICK ? [1440] : [1440, 1024, 390], THEMES = QUICK ? ['light'] : ['light', 'dark'];
  for (const [dn, deck] of [['acquisition', A], ['development', V]]) for (const w of WIDTHS) for (const theme of THEMES) {
    const ctx = await b.newContext({ viewport: { width: w, height: 900 }, isMobile: w <= 480, hasTouch: w <= 768 }), p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.route(/supabase\.co|vercel\.app|fonts\.g|cdn\.jsdelivr/, r => r.abort());
    await p.addInitScript(F => { const D = Date; class FD extends D { constructor(...a) { if (a.length) super(...a); else super(F); } static now() { return F; } } window.Date = FD; }, FIXED);
    await p.goto('file://' + HTML); await p.waitForTimeout(700); await p.evaluate(([d, t]) => { document.documentElement.classList.add('bk-auth-ok'); bkCreateNewDeal(d); bkTheme.set(t); }, [deck, theme]); await p.waitForTimeout(500);
    const sheets = await p.evaluate(() => { const o = []; document.querySelectorAll('.rail [data-sheet]').forEach(e => { const s = e.dataset.sheet; if (s && o.indexOf(s) < 0) o.push(s); }); return o; });
    const agg = { over: [], crushed: [], unclassified: [], misaligned: [], untiered: [], wide: [], tables: 0 };
    for (const s of sheets) { await p.evaluate(x => showSheet(x), s); await p.waitForTimeout(420); const r = await p.evaluate(SCAN); agg.tables += r.tables; ['over', 'crushed', 'unclassified', 'misaligned', 'untiered', 'wide'].forEach(k => r[k].forEach(x => agg[k].push(s + ' / ' + x))); }
    const tag = dn + ' ' + w + ' px ' + (theme === 'dark' ? 'Night' : 'Light');
    check(tag + ': nothing spills out of a table cell (' + agg.tables + ' tables on ' + sheets.length + ' sheets)', agg.over.length === 0, agg.over.length + ': ' + agg.over.slice(0, 5).join(' ; '));
    check(tag + ': no column is crushed (no word is wider than the cell that holds it)', agg.crushed.length === 0, agg.crushed.length + ': ' + agg.crushed.slice(0, 5).join(' ; '));
    if (w > 760) { check(tag + ': every table has a family and every column a role', agg.unclassified.length === 0, agg.unclassified.length + ': ' + agg.unclassified.slice(0, 5).join(' ; '));
      check(tag + ': a key-value or ledger table scrolls sideways only when it cannot fit its card', agg.wide.length === 0, agg.wide.length + ': ' + agg.wide.slice(0, 20).join(' ; '));
      check(tag + ': stacked tables with the same column roles line their columns up', agg.misaligned.length === 0, agg.misaligned.length + ': ' + agg.misaligned.slice(0, 5).join(' ; ')); }
    check(tag + ': every status label has a tier', agg.untiered.length === 0, agg.untiered.length + ': ' + [...new Set(agg.untiered.map(x => x.split(' / ').pop()))].slice(0, 12).join(', '));
    check(tag + ': no page errors', errs.length === 0, errs.slice(0, 2).join(' | ')); await ctx.close(); }
  console.log('table standard: ' + checks + ' checks, ' + fails + ' failures'); await b.close(); process.exit(fails ? 1 : 0); })();
