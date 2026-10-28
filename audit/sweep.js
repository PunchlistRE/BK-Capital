// Section sweep: opens every section (acquisition and development deal) in day and night mode at desktop width and at phone width and reports, per section:
// sideways overflow, clipped text, unreadable contrast, tiny type, an empty page, page errors. A finding list, not a pass/fail test.
//   node audit/sweep.js index.html [out.json]
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); const path = require('path'), fs = require('fs');
const A = require(path.join(__dirname, 'deal.js'));
const DEV = (() => { try { return require(path.join(__dirname, 'devdeal.js')); } catch (e) { return Object.assign({}, A, { dealType: 'Development' }); } })();
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined }); const out = {};
  const sheetsOf = async (p) => p.evaluate(() => { const hidden = new Set(GROUPS.filter(g => g.hidden).flatMap(g => g.sheets)); return GROUPS.flatMap(g => g.sheets).filter(s => !hidden.has(s) && RENDERERS[s]).filter((s, i, a) => a.indexOf(s) === i); });
  const measure = () => {
    const lum = (r, g, bl) => { const f = c => { c /= 255; return c <= .03928 ? c / 12.92 : Math.pow((c + .055) / 1.055, 2.4); }; return .2126 * f(r) + .7152 * f(g) + .0722 * f(bl); };
    const parse = (c) => { const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?/.exec(c); return m ? [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]] : null; };
    const bgOf = (e) => { while (e) { const c = parse(getComputedStyle(e).backgroundColor); if (c && c[3] > 0.5) return c; e = e.parentElement; } return [255, 255, 255, 1]; };
    const v = document.getElementById('viewport'), res = { overflow: 0, clipped: [], contrast: [], tiny: [], textLen: v ? v.innerText.trim().length : 0 };
    res.overflow = Math.max(0, document.documentElement.scrollWidth - innerWidth);
    const seen = new Set();
    [...v.querySelectorAll('*')].forEach(e => {
      const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return; const r = e.getBoundingClientRect(); if (r.width < 4 || r.height < 4) return;
      const own = [...e.childNodes].filter(n => n.nodeType === 3 && n.textContent.trim().length > 1).map(n => n.textContent.trim()).join(' '); if (!own) return;
      const key = e.tagName + '|' + own.slice(0, 30); if (seen.has(key)) return; seen.add(key);
      const fg = parse(cs.color), bg = bgOf(e); if (fg) { const a = fg[3], mix = [0, 1, 2].map(i => fg[i] * a + bg[i] * (1 - a)), L1 = lum(...mix), L2 = lum(bg[0], bg[1], bg[2]), ratio = (Math.max(L1, L2) + .05) / (Math.min(L1, L2) + .05); if (ratio < 3 && !e.closest('[disabled], .dim, .bk-dim, .ph, [placeholder]') && !/^\d{1,2}$/.test(own)) res.contrast.push(own.slice(0, 40) + ' (' + ratio.toFixed(1) + ')'); }
      const fs = parseFloat(cs.fontSize); if (fs < 8.5 && own.length > 3) res.tiny.push(own.slice(0, 30) + ' (' + fs + 'px)');
      if ((cs.overflow === 'hidden' || cs.overflowX === 'hidden') && e.scrollWidth > e.clientWidth + 3 && cs.textOverflow !== 'ellipsis' && !/^(TABLE|TBODY|TR|DIV)$/.test(e.tagName) || (e.tagName === 'BUTTON' || e.tagName === 'LABEL' || e.tagName === 'TH') && e.scrollWidth > e.clientWidth + 3 && cs.overflow !== 'visible') res.clipped.push(e.tagName + ':' + own.slice(0, 40));
    });
    res.contrast = res.contrast.slice(0, 6); res.tiny = res.tiny.slice(0, 4); res.clipped = res.clipped.slice(0, 5); return res; };
  for (const [kind, deal] of [['acq', A], ['dev', DEV]]) for (const mode of ['dark', 'light']) for (const [vw, vh] of [[1280, 900], [390, 844]]) {
    const ctx = await b.newContext({ colorScheme: mode, viewport: { width: vw, height: vh } }), p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.route(/supabase\.co|vercel\.app|fonts\.g|cdn\.jsdelivr/, r => r.abort()); await p.goto('file://' + path.resolve(process.argv[2])); await p.waitForTimeout(600);
    await p.evaluate((d) => { document.documentElement.classList.add('bk-auth-ok'); localStorage.setItem('bk-pt-all', '0'); bkCreateNewDeal(d); const s = bkLoad(); Object.assign(s, d, { purchasePrice: s.purchasePrice || 19800000 }); bkSave(s); }, deal);
    const sheets = await sheetsOf(p);
    for (const sh of sheets) { errs.length = 0; try { await p.evaluate(async (sh) => { showSheet(sh); await new Promise(r => setTimeout(r, 650)); }, sh); } catch (e) { continue; }
      const m = await p.evaluate(measure); const k = sh + ' | ' + kind + ' ' + mode + ' ' + vw; out[k] = Object.assign(m, { errs: errs.slice(0, 2) }); }
    await ctx.close(); console.error('done', kind, mode, vw, sheets.length); }
  fs.writeFileSync(process.argv[3] || 'sweep.json', JSON.stringify(out, null, 1)); await b.close();
})();
