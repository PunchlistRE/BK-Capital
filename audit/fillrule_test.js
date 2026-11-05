// Fill rule (engine-wide): HEADER blue-grey names things (title bars, column headings, section dividers); KEY gold marks the answer
// (grand totals, headline metrics) and only sits on a row that carries values; SUB is a light tint for subtotals. Walks every sheet at a
// desktop and a phone width and fails on a value row filled as a header, or a heading filled as a key metric. The rule is written at the
// top of src/162a-bk-design-unify.css and in audit/README.md.
//   node audit/fillrule_test.js index.html
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); const path = require('path');
const A = require(path.join(__dirname, 'deal.js'));
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  let checks = 0, fails = 0; const check = (n, ok, d) => { checks++; if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? '  [' + d + ']' : '')); };
  for (const W of [1280, 390]) {
    const p = await b.newPage({ viewport: { width: W, height: W < 600 ? 844 : 1000 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.route(/supabase\.co|vercel\.app|fonts\.g|cdn\.jsdelivr/, r => r.abort()); await p.goto('file://' + path.resolve(process.argv[2])); await p.waitForTimeout(700);
    await p.evaluate(() => document.documentElement.classList.add('bk-auth-ok'));
    await p.evaluate((A) => { bkCreateNewDeal(A); const s = bkLoad(); Object.assign(s, A, { purchasePrice: 19800000 }); bkSave(s); }, A);
    const tok = await p.evaluate(() => { const v = document.getElementById('viewport'), pr = document.createElement('div'); v.appendChild(pr); const c = n => { pr.style.background = 'var(' + n + ')'; return getComputedStyle(pr).backgroundColor; }; const o = [c('--bk-fill-head'), c('--bk-fill-head2'), c('--bk-fill-key'), c('--bk-fill-sub')]; pr.remove(); return o; });
    if (W === 1280) check('the fill tokens exist and the key fill differs from both header fills and the subtotal tint', tok.every(x => x && x !== 'rgba(0, 0, 0, 0)') && tok[2] !== tok[0] && tok[2] !== tok[1] && tok[2] !== tok[3], tok.join(' | '));
    const all = await p.evaluate(() => { const o = []; GROUPS.forEach(g => { if (!g.hidden) o.push(...g.sheets); }); return o; });
    const bad = [];
    for (const sh of all) {
      const out = await p.evaluate(async (sh) => { showSheet(sh); await new Promise(r => setTimeout(r, 900));
        const v = document.getElementById('viewport'), pr = document.createElement('div'); v.appendChild(pr); const col = n => { pr.style.background = 'var(' + n + ')'; return getComputedStyle(pr).backgroundColor; };
        const K = col('--bk-fill-key'), H = [col('--bk-fill-head'), col('--bk-fill-head2')]; pr.remove();
        const bg = e => { for (let x = e; x && x !== v; x = x.parentElement) { const c = getComputedStyle(x).backgroundColor; if (c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent') return c; } return 'none'; };
        const out = [];
        v.querySelectorAll('table').forEach(t => [...t.rows].forEach(tr => { const cells = [...tr.cells]; if (!cells.length || !tr.getBoundingClientRect().width) return;
          const inHead = tr.parentElement.tagName === 'THEAD' || cells.every(c => c.tagName === 'TH'), sec = tr.classList.contains('sec') || tr.classList.contains('section') || (cells[0].colSpan > 1 && cells.length <= 2);
          const vals = cells.slice(1).some(c => /[\d$%]/.test(c.innerText) && !/^[A-Za-z ]+$/.test(c.innerText.trim())), fills = cells.map(bg), label = (cells[0].innerText || '').trim().slice(0, 30);
          if (!inHead && !sec && vals && fills.some(f => H.includes(f))) out.push('value row in header fill: ' + label);
          if ((inHead || sec) && fills.some(f => f === K)) out.push('heading in key fill: ' + label); }));
        [...v.querySelectorAll('caption')].forEach(c => { if (bg(c) === K) out.push('caption in key fill'); });
        return [...new Set(out)].slice(0, 4); }, sh);
      if (out.length) bad.push(sh + ' (' + out.join('; ') + ')');
    }
    check(W + ' px: no value row is filled as a header and no heading is filled as a key metric, on any of ' + all.length + ' sheets', bad.length === 0, bad.slice(0, 5).join(' | '));
    check(W + ' px: no page errors', errs.length === 0, errs.slice(0, 2).join(' | '));
    await p.close();
  }
  console.log(checks + ' checks, ' + fails + ' failures'); await b.close(); process.exit(fails ? 1 : 0);
})();
