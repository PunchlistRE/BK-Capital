// The Guide (src/158) walked from a blank app to the results, for an acquisition and a development, on a desktop and a phone, plus the defects the walkthrough found (audit/qa/GUIDE_REVIEW.md):
// each new step opens at its top with the keyboard on its heading; what a step says (advice, result strip, "still needed", suggestions) reads the figures as typed; the IRR line waits until the
// deal can run instead of showing a nonsense figure; the Sources and uses step does not raise a "does not tie" alarm before the hold and exit are in, and shows no empty card; every amount and
// percentage box carries its unit; the progress marks have a key; on a phone the progress is one row; a development's result strip and advice do not treat the land price as a purchase price;
// the start screen counts its ways in and its steps correctly; and both deal types reach the review and Returns with no page error.
//   node audit/guide_walk_test.js index.html
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); const path = require('path');
const A = require(path.join(__dirname, 'deal.js')), V = require(path.join(__dirname, 'devdeal.js'));
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  let checks = 0, fails = 0; const check = (n, ok, d) => { checks++; if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? '  [' + String(d).slice(0, 400) + ']' : '')); };
  const fresh = async (w) => { const ctx = await b.newContext({ viewport: { width: w, height: w > 600 ? 1000 : 844 } }); const p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
    await p.route(/supabase\.co|vercel\.app|fonts\.g|cdn\.jsdelivr/, r => r.abort()); await p.goto('file://' + path.resolve(process.argv[2])); await p.waitForTimeout(700);
    await p.evaluate(() => { try { localStorage.clear(); } catch (e) {} }); await p.reload(); await p.waitForTimeout(700); await p.evaluate(() => { document.documentElement.classList.add('bk-auth-ok'); bkGuideOn(); }); await p.waitForTimeout(400); return p; };
  const FILL = (p, d) => p.evaluate((d) => { document.querySelectorAll('#viewport .gd-f input[id^="gdf-"]').forEach(inp => { const k = inp.id.slice(4); if (!(k in d) || inp.type === 'checkbox') return; let v = d[k]; if (typeof v !== 'number' && typeof v !== 'string') return;
    const lab = inp.closest('.gd-f').querySelector('label').textContent; if (typeof v === 'number' && /%/.test(lab) && Math.abs(v) < 1.5) v = Math.round(v * 1e6) / 1e4; inp.value = String(v); inp.dispatchEvent(new Event('change')); }); }, d);
  const H1 = (p) => p.evaluate(() => (document.querySelector('#viewport .gd h1') || {}).textContent);

  /* 1. the start screen */
  let p = await fresh(1440);
  const st = await p.evaluate(() => { const t = document.querySelector('#viewport .gd').innerText; return { t, opts: document.querySelectorAll('#viewport .gd-opt').length, acq: (t.match(/acquisition[\s\S]*?(\d+) short steps/i) || [])[1], dev: (t.match(/development[\s\S]*?(\d+) short steps/i) || [])[1] }; });
  await p.evaluate(() => bkGuideBlank('Acquisition')); await p.waitForTimeout(500);
  const n1 = await p.evaluate(() => (document.querySelector('#viewport .gd div').textContent.match(/of (\d+)/) || [])[1]);
  check('the start screen does not promise "two ways in" above four options or "about 15 questions", and the step count it gives is the number of steps the guide walks', st.opts === 4 && !/Two ways in|About 15 questions/i.test(st.t) && st.acq === n1 && Number(st.dev) > 0, JSON.stringify([st.opts, st.acq, st.dev, n1]));

  /* 2. units in the boxes, separators, the key to the marks */
  await p.evaluate(() => bkGuideGo('price')); await p.waitForTimeout(400);
  const un = await p.evaluate(() => { const box = document.getElementById('gdf-purchasePrice'); box.value = '24000000'; box.dispatchEvent(new Event('change')); const w = (id) => { const e = document.getElementById(id); const wr = e && e.parentElement; return wr ? [...wr.children].filter(x => x.tagName === 'I').map(x => x.textContent).join('') : null; };
    const near = (id) => { const e = document.getElementById(id), i = e && e.parentElement.querySelector('i'); if (!i) return 999; const a = e.getBoundingClientRect(), c = i.getBoundingClientRect(); return Math.min(Math.abs(c.left - a.right), Math.abs(a.left - c.right)); };
    return { price: w('gdf-purchasePrice'), cc: w('gdf-closingCostsPct'), shown: box.value, gapP: near('gdf-purchasePrice'), gapC: near('gdf-closingCostsPct'), key: [...document.querySelectorAll('#viewport .gd-key span')].map(x => x.textContent.trim()) }; });
  check('an amount box carries "$" and a percentage box "%", each right beside its box, and an amount typed as 24000000 reads 24,000,000', un.price === '$' && un.cc === '%' && un.gapP <= 12 && un.gapC <= 12 && un.shown === '24,000,000', JSON.stringify(un));
  check('the progress marks have a key: reviewed, entered but not reviewed, reviewed with a figure missing, skipped', un.key.length === 4 && /reviewed/.test(un.key[0]) && /not yet reviewed/.test(un.key[1]) && /missing/.test(un.key[2]) && /skipped/.test(un.key[3]), un.key.join(' | '));

  /* 3. Continue at the foot of a long step opens the next one at its top, with the keyboard on its heading */
  await p.evaluate(() => bkGuideGo('expenses')); await p.waitForTimeout(400);
  await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await p.waitForTimeout(100);
  const y0 = await p.evaluate(() => window.scrollY); await p.evaluate(() => document.getElementById('gd-next').click()); await p.waitForTimeout(600);
  const ar = await p.evaluate(() => ({ y: window.scrollY, f: document.activeElement && document.activeElement.tagName, h: document.querySelector('#viewport .gd h1').textContent, ring: getComputedStyle(document.querySelector('#viewport .gd h1')).outlineStyle }));
  check('desktop: Continue from the foot of a step opens the next step at the top of the page with the keyboard on its heading (no focus ring drawn on the heading)', y0 > 200 && ar.y === 0 && ar.f === 'H1' && ar.h !== 'Operating expenses' && ar.ring === 'none', JSON.stringify([y0, ar]));
  /* "Use this" re-draws the same step: it keeps its place */
  await p.evaluate(() => bkGuideGo('expenses')); await p.waitForTimeout(400); await p.evaluate(() => window.scrollTo(0, 700)); await p.waitForTimeout(60);
  const use = await p.evaluate(async () => { const b = [...document.querySelectorAll('#viewport .gd-sug button')][0]; if (!b) return null; const y = window.scrollY; b.click(); await new Promise(r => setTimeout(r, 300)); return [y, window.scrollY]; });
  check('a suggestion\'s "Use this" re-draws the same step and keeps the page where it was (it does not jump to the top; the answered suggestion closing may shift it a little)', use && use[0] > 300 && use[1] > use[0] - 80, JSON.stringify(use));

  /* 4. the step reads the figures as typed */
  await p.evaluate((d) => { const s = bkLoad(); Object.assign(s, d); ['insurance', 'mgmtPct', 'reserves', 'taxes', 'repairs'].forEach(k => { s[k] = 0; }); bkSave(s); bkGuideGo('expenses'); }, A); await p.waitForTimeout(500);
  const bef = await p.evaluate(() => ({ adv: (document.getElementById('gd-advw') || {}).innerText || '', still: document.getElementById('gd-still').innerText }));
  await FILL(p, A); await p.waitForTimeout(500);
  const aft = await p.evaluate(() => { const res = (document.getElementById('gd-resw') || {}).innerText || '', o = {};
    document.querySelectorAll('#viewport .gd-f input[id^="gdf-"]').forEach(inp => { if (inp.type === 'checkbox') return; const k = inp.id.slice(4), lab = inp.closest('.gd-f').querySelector('label').textContent, v = parseFloat(String(inp.value).replace(/[^0-9.\-]/g, '')); if (isFinite(v)) o[k] = /%/.test(lab) ? v / 100 : v; });   /* the step's own boxes, read as the guide reads them */
    const noiDraft = bkRunWith(o, () => bkCalc().noi);
    return { adv: (document.getElementById('gd-advw') || {}).innerText || '', still: document.getElementById('gd-still').innerText, res, noiDraft: Math.round(noiDraft), noiSaved: Math.round(bkCalc().noi) }; });
  check('before anything is typed the step flags the blanks (insurance, management fee, still needed)', /Insurance is blank/.test(bef.adv) && /management fee/i.test(bef.adv) && /Still needed here/.test(bef.still), JSON.stringify(bef));
  check('once the figures are typed (not yet confirmed) the advice drops what was filled, "still needed" names none of the typed fields, and the result strip shows the NOI with the typed expenses', !/Insurance is blank|There is no management fee/.test(aft.adv) && !/insurance|real estate taxes|management fee/i.test(aft.still) && aft.res.indexOf('$' + aft.noiDraft.toLocaleString('en-US')) >= 0 && aft.noiDraft !== aft.noiSaved, JSON.stringify(aft));
  check('a negative amount in the result strip reads in parentheses, not "$-"', await p.evaluate(() => { const s = bkLoad(); Object.assign(s, { avgRent: 0, otherIncome: 0, rentRoll: [], commLeaseModel: false, taxes: 100000 }); bkSave(s); bkGuideGo('expenses'); return new Promise(r => setTimeout(() => { const t = (document.getElementById('gd-resw') || {}).innerText || ''; r(!/\$-/.test(t) && /\(\$[\d,]+\)/.test(t)); }, 300)); }));
  check('no page errors on the acquisition checks', p.errs.length === 0, p.errs.slice(0, 2).join(' | ')); await p.context().close();

  /* 5. development: the IRR line waits, suggestions step aside, no cap rate on the land, and Sources and uses before the hold */
  p = await fresh(1440); await p.evaluate(() => bkGuideBlank('Development')); await p.waitForTimeout(500);
  await FILL(p, V); await p.evaluate(() => document.getElementById('gd-next').click()); await p.waitForTimeout(600);
  const land = await p.evaluate(() => (document.getElementById('gd-imp') || {}).innerText || '');
  await FILL(p, V); await p.waitForTimeout(500);
  const land2 = await p.evaluate(() => ({ imp: (document.getElementById('gd-imp') || {}).innerText || '', sug: [...document.querySelectorAll('#viewport .gd-sug')].map(e => [e.getAttribute('data-k'), e.style.display, (document.getElementById('gdf-' + e.getAttribute('data-k')) || {}).value, e.getAttribute('data-v')]) }));
  const irrs = (t) => (t.match(/([\d.]+)%/g) || []).map(x => parseFloat(x));
  check('development, before the deal can run: the IRR line explains what it waits for instead of a figure (it read "450.00% · multiple 0.00x")', /shows here once the deal has what it needs/.test(land) && !/x\b/.test(land) && irrs(land).every(v => v < 100), land);
  check('a suggestion steps aside once its box holds the suggested figure, and stays while the box holds something else', land2.sug.length > 0 && land2.sug.every(([k, disp, val, sv]) => (Number(String(val).replace(/,/g, '')) === Number(sv)) === (disp === 'none')), JSON.stringify(land2.sug));
  await p.evaluate(() => document.getElementById('gd-next').click()); await p.waitForTimeout(500); await FILL(p, V); await p.waitForTimeout(400);
  const rs = await p.evaluate(() => (document.getElementById('gd-resw') || {}).innerText || '');
  check('development: the result strip shows income and NOI but no "cap rate on price" (the price is the land)', /Net operating income/.test(rs) && !/Cap rate on price/i.test(rs), rs);
  await p.evaluate(() => document.getElementById('gd-next').click()); await p.waitForTimeout(500); await FILL(p, V); await p.evaluate(() => document.getElementById('gd-next').click()); await p.waitForTimeout(500);
  await FILL(p, V); await p.evaluate(() => document.getElementById('gd-next').click()); await p.waitForTimeout(600);
  const su = await p.evaluate(() => ({ h: document.querySelector('#viewport .gd h1').textContent, t: document.querySelector('#viewport .gd').innerText, empty: [...document.querySelectorAll('#viewport .gd .gd-card')].filter(c => !c.innerText.trim()).length, wait: !!document.querySelector('#viewport .gd-su tr.gd-wait'), can: bkDealReadiness().canCalculate }));
  check('Sources and uses before the hold and exit: no "Does not tie" alarm and no $0 contributed equity, a line saying when those measures appear, and no empty card', su.h === 'Sources and uses' && !su.can && !/Does not tie/.test(su.t) && su.wait && su.empty === 0, JSON.stringify({ h: su.h, can: su.can, wait: su.wait, empty: su.empty, tie: /Does not tie/.test(su.t) }));
  const advDev = await p.evaluate(() => { const s = bkLoad(); Object.assign(s, { holdYears: 6, exitCap: 0.0525 }); bkSave(s); return bkGuideSections ? (function(){ bkGuideGo('exit'); return new Promise(r => setTimeout(() => r((document.getElementById('gd-advw') || {}).innerText || ''), 400)); })() : ''; });
  check('development: the exit advice never compares the exit cap with a "going-in cap" on the land price', !/but buy at/.test(advDev), advDev);
  check('no page errors on the development checks', p.errs.length === 0, p.errs.slice(0, 2).join(' | ')); await p.context().close();

  /* 6. start to finish, both deal types, desktop and phone: every step opens at its top on its heading, and the review and Returns are reached */
  for (const w of [1440, 390]) for (const [kind, deal] of [['Acquisition', A], ['Development', V]]) {
    p = await fresh(w); await p.evaluate((k) => bkGuideBlank(k), kind); await p.waitForTimeout(500);
    const seen = [], bad = []; let phone = null;
    for (let i = 0; i < 14; i++) { const h = await H1(p); seen.push(h); if (h === 'Review') break;
      if (w < 600 && !phone) phone = await p.evaluate(() => { const vis = [...document.querySelectorAll('#viewport .gd-prog .gd-chip')].filter(c => c.getBoundingClientRect().width > 0); const more = document.querySelector('#viewport .gd-more'); const wl = [...document.querySelectorAll('#viewport .gd .gd-btn.link')].find(x => /Where this deal stands/.test(x.textContent));
        const rows = new Set(vis.map(c => Math.round(c.getBoundingClientRect().top))).size; more.click(); const all = [...document.querySelectorAll('#viewport .gd-prog .gd-chip')].filter(c => c.getBoundingClientRect().width > 0).length; more.click();
        return { vis: vis.length, rows, all, total: document.querySelectorAll('#viewport .gd-prog .gd-chip').length, where: wl ? Math.round(wl.getBoundingClientRect().height) : 0, over: document.documentElement.scrollWidth - innerWidth }; });
      await FILL(p, deal); await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await p.waitForTimeout(80);
      await p.evaluate(() => document.getElementById('gd-next').click()); await p.waitForTimeout(500);
      const a = await p.evaluate(() => ({ y: window.scrollY, f: document.activeElement && document.activeElement.tagName, over: document.documentElement.scrollWidth - innerWidth })); if (a.y !== 0 || a.f !== 'H1' || a.over > 1) bad.push(h + ' ' + JSON.stringify(a)); }
    await p.evaluate(() => bkGuideDetail('Returns')); await p.waitForTimeout(800); const ret = await p.evaluate(() => ({ sheet: typeof currentSheet !== 'undefined' ? currentSheet : '', pill: !!document.getElementById('bk-guide-back') }));
    const tag = kind.toLowerCase() + ', ' + (w > 600 ? 'desktop' : 'phone');
    check(tag + ': every step opens at the top of the page on its heading, the page never scrolls sideways, and the walk reaches the review (' + seen.length + ' screens) and then Returns, with the way back to the guide', bad.length === 0 && seen[seen.length - 1] === 'Review' && ret.sheet === 'Returns' && ret.pill, bad.slice(0, 2).join(' | ') + ' ' + seen.join(' > '));
    if (phone) check(tag + ': the progress is one row (the current step and an "All steps" button that opens the rest), and "Where this deal stands" is at least 32px tall to tap', phone.vis === 2 && phone.rows === 1 && phone.all === phone.total && phone.where >= 32 && phone.over <= 1, JSON.stringify(phone));
    check(tag + ': no page errors', p.errs.length === 0, p.errs.slice(0, 2).join(' | ')); await p.context().close();
  }
  console.log(checks + ' checks, ' + fails + ' failures'); await b.close(); process.exit(fails ? 1 : 0);
})();
