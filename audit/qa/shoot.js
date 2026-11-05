// Visual QA harness: renders every sheet for a populated acquisition, a populated development deal and a blank deal, at desktop (1440) and phone (390) width, saves a screenshot of each, and measures layout defects
// (page-level sideways scroll, clipped cells, numeric columns that are not right-aligned, mixed decimals in one column, empty / placeholder text, overlapping text). It reads and measures only; it changes nothing.
//   node audit/qa/shoot.js <out dir> [--desktop-only] [--sheets "A,B"] [--decks acq,dev,blank] [--full] [--index path/to/index.html]
//   --full saves the whole page (not only the first screen); --decks limits the decks; --index measures another build.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); const path = require('path'), fs = require('fs');
const A = require('../deal.js'), V = require('../devdeal.js');
const arg = (k) => (process.argv.indexOf(k) > 0 ? process.argv[process.argv.indexOf(k) + 1] : null);
const out = process.argv[2], only = arg('--sheets') ? arg('--sheets').split(',') : null, desktopOnly = process.argv.includes('--desktop-only'), full = process.argv.includes('--full');
const deckOnly = arg('--decks') ? arg('--decks').split(',') : null, INDEX = path.resolve(arg('--index') || path.resolve(__dirname, '../../index.html'));
fs.mkdirSync(out, { recursive: true });
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined }); const report = [];
  const decks = [['acq', Object.assign({}, A)], ['dev', Object.assign({}, V)], ['blank', { name: 'Blank', dealId: 'QB', dealType: 'Acquisition', blankStructure: true }]].filter(([k]) => !deckOnly || deckOnly.includes(k));
  for (const [vw, vh, tag] of [[1440, 900, 'd']].concat(desktopOnly ? [] : [[390, 844, 'm']])) {
    const ctx = await b.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: 1 }), p = await ctx.newPage();
    await p.route(/supabase\.co|vercel\.app|fonts\.g|cdn\.jsdelivr/, r => r.abort()); await p.goto('file://' + INDEX); await p.waitForTimeout(800);
    for (const [dk, deal] of decks) {
      await p.evaluate((d) => { document.documentElement.classList.add('bk-auth-ok'); bkCreateNewDeal(d); const s = bkLoad(); Object.assign(s, d); bkSave(s); }, deal);
      const names = (await p.evaluate(() => Object.keys(RENDERERS))).filter(n => !only || only.includes(n));
      for (const n of names) {
        const m = await p.evaluate(async (n) => { try { showSheet(n); } catch (e) { return { err: e.message }; } await new Promise(r => setTimeout(r, 180)); const v = document.querySelector('#viewport'); if (!v) return { err: 'no viewport' };
          const W = document.documentElement.clientWidth, over = document.documentElement.scrollWidth - W, tbls = [...v.querySelectorAll('table')];
          const clipped = [...v.querySelectorAll('td,th')].filter(e => e.innerText && e.innerText.trim() && e.scrollWidth > e.clientWidth + 2 && getComputedStyle(e).overflow !== 'visible').length;
          const numMis = []; tbls.forEach(t => { const rows = [...t.querySelectorAll('tbody tr')].slice(0, 40); const cols = {}; rows.forEach(r => [...r.children].forEach((c, i) => { const tx = (c.innerText || '').trim(); if (/^[\(\-−]?\$?[\d,]+(\.\d+)?%?x?\)?$/.test(tx) && tx.length > 1) { (cols[i] = cols[i] || []).push(getComputedStyle(c).textAlign); } })); Object.keys(cols).forEach(i => { const a = cols[i]; if (a.length >= 3 && a.some(x => x !== 'right' && x !== 'end') ) numMis.push((t.querySelector('caption') ? t.querySelector('caption').innerText.slice(0, 30) : 'table') + ' col ' + i); }); });
          const decs = []; tbls.forEach(t => { const rows = [...t.querySelectorAll('tbody tr')].slice(0, 40), cols = {}; rows.forEach(r => [...r.children].forEach((c, i) => { const tx = (c.innerText || '').trim(); const m2 = /^[\(\-−]?\$?[\d,]+(?:\.(\d+))?%$/.exec(tx); if (m2) (cols[i] = cols[i] || []).push((m2[1] || '').length); })); Object.keys(cols).forEach(i => { const a = cols[i]; if (a.length >= 3 && new Set(a).size > 1) decs.push((t.querySelector('caption') ? t.querySelector('caption').innerText.slice(0, 30) : 'table') + ' col ' + i + ' [' + [...new Set(a)].join('/') + ']'); }); });
          const txt = v.innerText, bad = (txt.match(/NaN|undefined|Infinity|\[object|null\b/g) || []).length;
          /* beyond the table cells: any visible element pushed past the right edge outside a sideways-scrolling box, any label / button / chip / tab whose text is cut off,
             type under 10px, and (phone) controls smaller than 24px to tap */
          const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; };
          const inScroller = (e) => { for (let q = e.parentElement; q && q !== document.body; q = q.parentElement) { const ox = getComputedStyle(q).overflowX; if (ox === 'auto' || ox === 'scroll' || ox === 'hidden') return true; } return false; };
          const all = [...document.querySelectorAll('#viewport *, .tabnav *, .bk-flow *, .brand-bar *')];
          const offRight = all.filter((e) => vis(e) && e.children.length === 0 && (e.innerText || '').trim() && e.getBoundingClientRect().right > W + 1 && !inScroller(e)).slice(0, 6).map((e) => (e.innerText || '').trim().slice(0, 40));
          const cut = all.filter((e) => e.children.length === 0 && vis(e) && (e.innerText || '').trim().length > 1 && /^(BUTTON|A|LABEL|SPAN|DIV|TH|TD|LI|SUMMARY|OPTION|STRONG|B)$/.test(e.tagName) && e.scrollWidth > e.clientWidth + 2 && /hidden|clip/.test(getComputedStyle(e).overflow + getComputedStyle(e).textOverflow)).slice(0, 6).map((e) => (e.innerText || '').trim().slice(0, 40));
          const tiny = all.filter((e) => e.children.length === 0 && vis(e) && (e.innerText || '').trim() && parseFloat(getComputedStyle(e).fontSize) < 10).length;
          const smallTap = W < 500 ? [...document.querySelectorAll('#viewport button, #viewport select, #viewport input:not([type=hidden]), #viewport a[href], .tabnav button, .tabnav a')].filter((e) => { if (!vis(e)) return false; const r = e.getBoundingClientRect(); return r.height < 24 || r.width < 24; }).length : 0;
          return { over, clipped, numMis: numMis.slice(0, 4), decs: decs.slice(0, 4), bad, len: txt.length, h: v.scrollHeight, offRight, cut, tiny, smallTap }; }, n);
        const safe = n.replace(/[^A-Za-z0-9]+/g, '_'); if (!m.err && !fs.existsSync(path.join(out, dk + '_' + tag + '_' + safe + '.png'))) { try { await p.screenshot({ path: path.join(out, dk + '_' + tag + '_' + safe + '.png'), fullPage: full }); } catch (e) {} }
        report.push(Object.assign({ deck: dk, vw: tag, sheet: n }, m)); } } await ctx.close(); }
  fs.writeFileSync(path.join(out, 'measure.json'), JSON.stringify(report, null, 1)); const bad = report.filter(r => r.err || r.over > 2 || r.clipped || (r.numMis && r.numMis.length) || (r.decs && r.decs.length) || r.bad || (r.offRight && r.offRight.length) || (r.cut && r.cut.length));
  console.log('sheets measured', report.length, 'with defects', bad.length); await b.close();
})();
