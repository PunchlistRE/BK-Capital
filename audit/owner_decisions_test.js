// The owner's decisions of November 2026, each held in place:
//  1. a new acquisition starts with closing costs of 2% (inside the guide's own 1.5% to 3% range); a development, and any deal that sets its own, keep theirs; a saved deal is not moved;
//  2. Source Ingestion QA reads N/A ("not evaluated") until a source document has been read, and runs its checks once one has;
//  3. on a phone the charts' text is real size (it read 5 to 6px) and no two labels touch; every header control is at least 40px to tap, and the product name is not cut off;
//     the desktop, print and investor-PDF charts are drawn exactly as before (760 units wide).
//   node audit/owner_decisions_test.js index.html
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); const path = require('path');
const A = require(path.join(__dirname, 'deal.js'));
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  let checks = 0, fails = 0; const check = (n, ok, d) => { checks++; if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? '  [' + String(d).slice(0, 400) + ']' : '')); };
  const open = async (w, mobile) => { const p = await (await b.newContext(Object.assign({ viewport: { width: w, height: mobile ? 844 : 1000 } }, mobile ? { isMobile: true, hasTouch: true } : {}))).newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
    await p.route(/supabase\.co|vercel\.app|fonts\.g|cdn\.jsdelivr/, r => r.abort()); await p.goto('file://' + path.resolve(process.argv[2])); await p.waitForTimeout(700); await p.evaluate(() => document.documentElement.classList.add('bk-auth-ok')); return p; };

  /* 1. closing costs */
  let p = await open(1440);
  const cc = await p.evaluate(() => { const out = {}; bkCreateNewDeal({ name: 'A', dealType: 'Acquisition' }); out.acq = bkLoad().closingCostsPct; out.tpl = (bkLoad()._template || {}).values ? bkLoad()._template.values.closingCostsPct : null;
    bkCreateNewDeal({ name: 'D', dealType: 'Development' }); out.dev = bkLoad().closingCostsPct;
    bkCreateNewDeal({ name: 'O', dealType: 'Acquisition', closingCostsPct: 0.035 }); out.own = bkLoad().closingCostsPct;
    bkCreateNewDeal({ name: 'B', dealType: 'Acquisition', blankStructure: true }); out.blank = bkLoad().closingCostsPct;
    bkCreateNewDeal({ name: 'S', dealType: 'Acquisition' }); const s = bkLoad(); s.closingCostsPct = 0.05; bkSave(s); out.saved = bkLoad().closingCostsPct;
    bkGuideOn(); bkGuideBlank('Acquisition'); bkGuideGo('price'); out.guideMsg = [...document.querySelectorAll('#gdm-closingCostsPct div')].map(x => x.textContent).join(' '); out.guideVal = (document.getElementById('gdf-closingCostsPct') || {}).value; bkGuideOff(); return out; });
  check('a new acquisition starts with closing costs of 2%, recorded as a template value it can change', cc.acq === 0.02 && cc.tpl === 0.02, JSON.stringify(cc));
  check('a new development keeps the base closing-cost rate on its land, a deal that sets its own keeps it, a fully blank deal stays blank, and a saved deal at 5% stays at 5%', cc.dev === 0.05 && cc.own === 0.035 && (cc.blank === '' || cc.blank == null || cc.blank === 0) && cc.saved === 0.05, JSON.stringify(cc));
  check('the guide no longer opens Price and closing by flagging its own default: the box reads 2 and carries no "outside the usual range" note', cc.guideVal === '2' && !/outside the usual range/.test(cc.guideMsg), JSON.stringify([cc.guideVal, cc.guideMsg]));

  /* 2. Source Ingestion QA */
  const qa = await p.evaluate(async () => { localStorage.removeItem('bkcapital.source.staging.v02'); bkCreateNewDeal({ name: 'Q', dealType: 'Acquisition' }); const direct = bkRunIngestionQA();
    showSheet('QA'); await new Promise(r => setTimeout(r, 600)); const row = [...document.querySelectorAll('#viewport tr')].find(r => /^Source Ingestion QA/.test((r.children[0] || {}).textContent || ''));
    const out = { na: direct.na, reason: direct.reason, chip: row && (row.querySelector('.status-chip') || {}).textContent, text: row && row.innerText.replace(/\s+/g, ' ') };
    localStorage.setItem('bkcapital.source.staging.v02', JSON.stringify({ sheetNames: ['T12'], sheetInventory: [{ name: 'T12' }], rawRows: [{ r: 1 }], normalizedFacts: [], candidates: [], rentRollRows: [], reportClassification: { type: 'T-12', scope: 'PROPERTY' }, activeIdentity: { dealId: 'Q', name: 'Q' } }));
    const staged = bkRunIngestionQA(); out.stagedNa = !!staged.na; out.stagedTotal = staged.total; localStorage.removeItem('bkcapital.source.staging.v02'); return out; });
  check('with nothing read, Source Ingestion QA reads N/A with the reason "not evaluated", not "1 / 2 Failing"', qa.na === true && /Not evaluated/.test(qa.reason) && qa.chip === 'N/A' && !/Failing/.test(qa.text), JSON.stringify(qa));
  check('once a source document is staged, the suite runs its checks again (it is not switched off)', qa.stagedNa === false && qa.stagedTotal > 2, JSON.stringify(qa));

  /* 3a. desktop charts unchanged */
  const desk = await p.evaluate(async (d) => { bkCreateNewDeal(d); const s = bkLoad(); Object.assign(s, d); bkSave(s); const out = {}; for (const sh of ['Property CF', 'Returns', 'Operating Underwrite']) { showSheet(sh); await new Promise(r => setTimeout(r, 500)); out[sh] = [...document.querySelectorAll('#viewport .pf-card svg')].map(x => x.viewBox.baseVal.width); }
    out.pdf = (bkReportHTML().match(/viewBox="0 0 (\d+)/g) || []).filter(x => /760/.test(x)).length; return out; }, A);
  check('desktop and the investor PDF draw the charts at 760 units, as before', Object.keys(desk).filter(k => k !== 'pdf').every(k => desk[k].length > 0 && desk[k].every(w => w === 760)) && desk.pdf >= 2, JSON.stringify(desk));
  check('no page errors (desktop)', p.errs.length === 0, p.errs.slice(0, 2).join(' | ')); await p.context().close();

  /* 3b. phone charts and header */
  for (const [w, hold] of [[390, 5], [390, 10], [360, 10]]) {
    p = await open(w, true);
    const ph = await p.evaluate(async ([d, hold]) => { bkCreateNewDeal(d); const s = bkLoad(); Object.assign(s, d, { holdYears: hold }); bkSave(s); const out = { minPx: 99, overlaps: [], charts: 0 };
      for (const sh of ['Property CF', 'Returns', 'Operating Underwrite']) { showSheet(sh); window.scrollTo(0, 0); await new Promise(r => setTimeout(r, 600));
        document.querySelectorAll('#viewport .pf-card svg').forEach(svg => { out.charts++; const ts = [...svg.querySelectorAll('text')].filter(t => t.textContent.trim()); const sc = svg.getBoundingClientRect().width / svg.viewBox.baseVal.width;
          ts.forEach(t => { const px = parseFloat(t.getAttribute('font-size') || getComputedStyle(t).fontSize) * sc; if (px < out.minPx) out.minPx = Math.round(px * 10) / 10; });
          const bx = ts.map(t => ({ t: t.textContent, r: t.getBoundingClientRect() }));
          for (let i = 0; i < bx.length; i++) for (let j = i + 1; j < bx.length; j++) { const a = bx[i].r, c = bx[j].r; if (a.left < c.right - 1 && c.left < a.right - 1 && a.top < c.bottom - 1 && c.top < a.bottom - 1) out.overlaps.push(sh + ': ' + bx[i].t + ' / ' + bx[j].t); } }); }
      const ctl = [...document.querySelectorAll('.pl-searchwrap > *, .pl-user button')].filter(e => e.getBoundingClientRect().width > 0).map(e => ({ t: (e.id || e.textContent || '').trim().slice(0, 14), h: Math.round(e.getBoundingClientRect().height), w: Math.round(e.getBoundingClientRect().width) }));
      const word = document.querySelector('.brand-bar .brand-mark .word'), box = word && word.parentElement; out.ctl = ctl; out.nameCut = !!box && (box.scrollWidth > box.clientWidth + 1 || word.scrollWidth > word.clientWidth + 1); out.over = document.documentElement.scrollWidth - innerWidth; return out; }, [A, hold]);
    const tag = w + 'px phone, ' + hold + '-year hold';
    check(tag + ': chart text is at least 10px on Property CF, Returns and Operating Underwrite (it read 5 to 6px), and no two chart labels overlap', ph.charts >= 3 && ph.minPx >= 10 && ph.overlaps.length === 0, JSON.stringify({ min: ph.minPx, charts: ph.charts, overlaps: ph.overlaps.slice(0, 3) }));
    check(tag + ': every header control is at least 40px to tap (the Guide switch and Sign in were 22px), the product name is not cut off, and nothing scrolls sideways', ph.ctl.length >= 4 && ph.ctl.every(c => c.h >= 40 && c.w >= 40) && !ph.nameCut && ph.over <= 1, JSON.stringify({ ctl: ph.ctl, cut: ph.nameCut }));
    check(tag + ': no page errors', p.errs.length === 0, p.errs.slice(0, 2).join(' | ')); await p.context().close();
  }
  console.log(checks + ' checks, ' + fails + ' failures'); await b.close(); process.exit(fails ? 1 : 0);
})();
