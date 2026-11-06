// Visual polish: the defects found by looking at every sheet on a phone (390 px) and on the web (1440 px), kept from coming back.
//  - phone: no sheet scrolls sideways as a page; every box that scrolls sideways says so ("Scroll sideways"); a key or total row in a stacked table is one band with no fill and no rule cutting between its label and its figure;
//    a select in a stacked row stays inside its cell and clear of the description beside it
//  - web: the capital tables on Sources & Uses fit their card (no sideways scroll); the Gantt task names are not cut off; the Home equity tile names its measure; a column of mixed values is not headed "Amount ($)"
//   node audit/visual_polish_test.js index.html
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); const path = require('path');
const A = require(path.join(__dirname, 'deal.js')), V = require(path.join(__dirname, 'devdeal.js'));
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  let checks = 0, fails = 0; const check = (n, ok, d) => { checks++; if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? '  [' + String(d).slice(0, 420) + ']' : '')); };
  const open = async (deal, w, h, mobile) => { const ctx = await b.newContext(mobile ? { viewport: { width: w, height: h }, isMobile: true, hasTouch: true } : { viewport: { width: w, height: h } }); const p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
    await p.route(/supabase\.co|vercel\.app|fonts\.g|cdn\.jsdelivr/, r => r.abort()); await p.goto('file://' + path.resolve(process.argv[2])); await p.waitForTimeout(700);
    await p.evaluate(d => { document.documentElement.classList.add('bk-auth-ok'); bkCreateNewDeal(d); }, deal); await p.waitForTimeout(300); return p; };
  const show = async (p, s) => { await p.evaluate(async (s) => { showSheet(s); await new Promise(r => setTimeout(r, 380)); }, s); await p.waitForTimeout(220); };

  /* PHONE, every sheet of the acquisition deck and of the development deck */
  for (const [tag, deal] of [['acquisition', A], ['development', V]]) {
    const p = await open(deal, 390, 844, true);
    const sheets = await p.evaluate(() => { const o = []; GROUPS.forEach(g => { if (!g.hidden) g.sheets.forEach(s => { if (o.indexOf(s) < 0) o.push(s); }); }); return o; });
    const over = [], noCue = [];
    for (const s of sheets) {
      await show(p, s);
      const r = await p.evaluate(() => { const vw = innerWidth, vis = (e) => { const rc = e.getBoundingClientRect(); return rc.width > 0 && rc.height > 0 && getComputedStyle(e).visibility !== 'hidden'; };
        const nh = []; document.querySelectorAll('#viewport *').forEach((e) => { if (nh.length > 4 || !vis(e) || e.matches('.rb-tabs, .bk-steps') || e.closest('.rb-tabs, .bk-steps, .bk-dui, .bk-tabs, .tabnav, [role=tablist]')) return; const cs = getComputedStyle(e); if (!/(auto|scroll)/.test(cs.overflowX) || e.scrollWidth <= e.clientWidth + 6) return; if (e.classList.contains('bk-scrollable') || e.closest('.bk-scrollable')) return; nh.push(e.tagName.toLowerCase() + '.' + String(e.className).split(' ')[0] + ' ' + e.scrollWidth + '>' + e.clientWidth); });
        return { doc: document.documentElement.scrollWidth, vw, nh }; });
      if (r.doc > r.vw + 1) over.push(s + ' ' + r.doc); if (r.nh.length) noCue.push(s + ': ' + r.nh.slice(0, 2).join(' | '));
    }
    check('phone, ' + tag + ' deck: none of the ' + sheets.length + ' sheets scrolls sideways as a page', over.length === 0, over.join(', '));
    check('phone, ' + tag + ' deck: every box that scrolls sideways carries the "Scroll sideways" cue', noCue.length === 0, noCue.slice(0, 4).join(' || '));
    check('phone, ' + tag + ' deck: no page errors', p.errs.length === 0, p.errs.slice(0, 2).join(' | ')); await p.close();
  }

  /* PHONE, a key row in a stacked table: no fill, and no rule between the label and the figure */
  { const p = await open(A, 390, 844, true); await show(p, 'Returns');
    const r = await p.evaluate(() => { const row = [...document.querySelectorAll('#viewport table.bk-m-stack tr')].find(t => /^Levered XIRR/.test(t.innerText.trim()));
      if (!row) return null; const cs = getComputedStyle(row), cells = [...row.children].filter(c => c.getBoundingClientRect().height > 0).map(c => { const k = getComputedStyle(c); return { bt: parseFloat(k.borderTopWidth), bb: parseFloat(k.borderBottomWidth), bg: k.backgroundColor, bs: k.boxShadow }; });
      return { bg: cs.backgroundColor, cells }; });
    const clear = (c) => c === 'rgba(0, 0, 0, 0)' || c === 'transparent';
    check('phone, Returns: the Levered XIRR key row is a band with no fill (the rules-not-fill choice)', !!r && clear(r.bg) && r.cells.every(c => clear(c.bg)), JSON.stringify(r));
    check('phone, Returns: no rule or bar is drawn on the cells inside the key row (nothing cuts between the label and its figure)', !!r && r.cells.every(c => c.bt === 0 && c.bb === 0 && (c.bs === 'none' || c.bs === '')), JSON.stringify(r && r.cells));
    await p.close(); }

  /* PHONE, Depreciation: a select stays inside its cell and clear of the text beside it */
  { const p = await open(A, 390, 844, true); await show(p, 'Depreciation');
    const r = await p.evaluate(() => { const bad = []; document.querySelectorAll('#viewport table.bk-m-stack td select').forEach(sel => { const td = sel.closest('td'), s = sel.getBoundingClientRect(), c = td.getBoundingClientRect(); if (s.width < 1) return; if (s.right > c.right + 1 || s.left < c.left - 1) bad.push('outside cell: ' + (sel.options[sel.selectedIndex] || {}).text);
        [...td.parentElement.children].forEach(o => { if (o === td) return; const q = o.getBoundingClientRect(); if (q.width > 0 && q.height > 0 && s.right > q.left + 1 && s.left < q.right - 1 && s.bottom > q.top + 1 && s.top < q.bottom - 1) bad.push('overlaps a neighbour: ' + (sel.options[sel.selectedIndex] || {}).text); }); }); return bad; });
    check('phone, Depreciation: no select sits outside its cell or over the description beside it', r.length === 0, r.slice(0, 3).join(' | ')); await p.close(); }

  /* WEB */
  { const p = await open(V, 1440, 900, false); await show(p, 'Sources & Uses');
    const r = await p.evaluate(() => [...document.querySelectorAll('#viewport .tbl-wrap')].filter(w => /Capital Measures|Capitalization Over the Life|Operating cash requirement and the unfunded/.test((w.querySelector('caption') || {}).textContent || '')).map(w => ({ cap: w.querySelector('caption').textContent.slice(0, 30), sw: w.scrollWidth, cw: w.clientWidth })));
    check('web, Sources & Uses (development): the three capital tables fit their card, none scrolls sideways', r.length === 3 && r.every(x => x.sw <= x.cw + 2), JSON.stringify(r));
    await show(p, 'Dev Schedule');
    const g = await p.evaluate(() => { const c = []; document.querySelectorAll('#viewport .bk-gx tbody tr td:nth-child(2)').forEach(td => { if (td.scrollWidth > td.clientWidth + 1) c.push(td.innerText.trim().slice(0, 40)); }); return { n: document.querySelectorAll('#viewport .bk-gx tbody tr').length, clipped: c }; });
    check('web, Dev Schedule: ' + g.n + ' Gantt rows and no task name is cut off', g.n > 10 && g.clipped.length === 0, g.clipped.slice(0, 4).join(' | '));
    await p.close(); }
  { const p = await open(A, 1440, 900, false); await show(p, 'Home');
    const r = await p.evaluate(() => { const F = bkFundingSummary().measures.totalContributedEquity.amount; const tiles = [...document.querySelectorAll('#viewport .pl-kpi')].map(t => [(t.querySelector('.k') || {}).textContent || '', (t.querySelector('.v') || {}).textContent || '']); return { F, tiles }; });
    const money0 = (t) => parseFloat(String(t).replace(/[$,M]/g, '')) * (/M$/.test(t) ? 1e6 : 1);
    check('web, Home: the equity tile is named Total contributed equity and shows that measure (no bare "Equity" tile)', r.tiles.every(([k]) => k.trim() !== 'Equity') && r.tiles.some(([k, v]) => /^Total contributed equity$/i.test(k.trim()) && Math.abs(money0(v.trim()) - r.F) / r.F < 0.006), JSON.stringify(r.tiles.filter(([k]) => /quity/i.test(k))) + ' ' + r.F);
    await show(p, 'Debt');
    const h = await p.evaluate(() => { const cap = [...document.querySelectorAll('#viewport caption')].find(c => /Acquisition Loan Terms/.test(c.textContent)); if (!cap) return null; const t = cap.closest('table'), pay = [...t.querySelectorAll('tbody tr')].find(r => /Monthly Payment/.test(r.innerText)); return { head: [...t.querySelectorAll('thead th')].map(x => x.textContent.trim()), pay: pay ? pay.children[1].textContent.trim() : null }; });
    check('web, Debt: the "Acquisition Loan Terms" column of a rate type, rates and a payment is headed Value, not "Amount ($)", and the payment keeps its dollar sign', !!h && h.head[1] === 'Value' && /^\$[\d,]+$/.test(h.pay || ''), JSON.stringify(h));
    await p.close(); }
  console.log(checks + ' checks, ' + fails + ' failures'); await b.close(); process.exit(fails ? 1 : 0);
})();
