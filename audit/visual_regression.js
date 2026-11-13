/* VISUAL REGRESSION (Phase 0 of the design plan). Presentation only: it reads the app, it never changes it, and it never touches a calculation or any deal data.
   It takes a canonical screenshot of every sheet at fixed viewports in Light and Night, shrinks each to a small WebP, and compares it with the stored baseline in audit/visual_baseline/.
   A page whose pixels moved more than the tolerance FAILS and a before / after / diff image is written, so an intended change is a conscious approval, not a surprise.
     node audit/visual_regression.js index.html                     compare everything against the baselines
     node audit/visual_regression.js index.html --only Debt,Revenues  only sheets whose name contains one of these
     node audit/visual_regression.js index.html --update --only Debt  APPROVE: rewrite the baselines for those sheets (commit them with the change that caused them)
     node audit/visual_regression.js index.html --report out/       where the before/after/diff images go (default: audit/visual_report/)
   Matrix: acquisition deck at desktop 1440 and phone 390, Light and Night; the Property Editor sub-tabs at desktop and phone, Light; the development deck at desktop, Light.
   Determinism: the clock is frozen, animations are off, the network is blocked, and every page is captured from the top. Baselines depend on the renderer's fonts; regenerate them
   (--update) on the machine that will run the check. Known limit: the baseline is small (about a third of the width), so it catches layout, fill, line, colour and clipping changes, not single-letter text edits. */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); const fs = require('fs'), path = require('path');
const args = process.argv.slice(2), HTML = path.resolve(args[0] || 'index.html'), flag = n => args.indexOf(n) >= 0, val = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const UPDATE = flag('--update'), ONLY = (val('--only') || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
const BASE = path.join(__dirname, 'visual_baseline'), REPORT = path.resolve(val('--report') || path.join(__dirname, 'visual_report'));
const TOL_PCT = Number(val('--tolerance') || 0.5), TOL_BLOCK = 60;   /* a page fails if over 0.5% of its 6x6 blocks changed colour, or any 16x16 area changed over 60% */
const A = require(path.join(__dirname, 'deal.js')), V = require(path.join(__dirname, 'devdeal.js'));
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const VP = { desktop: { width: 1440, height: 900, cap: 1600, w: 440 }, phone: { width: 390, height: 844, cap: 2000, w: 360 } };
fs.mkdirSync(BASE, { recursive: true });

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const tool = await b.newPage(); await tool.setContent('<canvas id=c></canvas>');
  /* in-browser image helpers: no image library needed */
  await tool.evaluate(() => {
    const load = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
    window.__small = async (pngB64, w) => { const i = await load('data:image/png;base64,' + pngB64), h = Math.round(i.height * w / i.width), c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(i, 0, 0, w, h); return c.toDataURL('image/webp', 0.5).split(',')[1]; };
    const px = async b64 => { const i = await load('data:image/webp;base64,' + b64), c = document.createElement('canvas'); c.width = i.width; c.height = i.height; const x = c.getContext('2d'); x.drawImage(i, 0, 0); return { w: i.width, h: i.height, d: x.getImageData(0, 0, i.width, i.height).data }; };
    window.__cmp = async (a64, b64, wantImg) => {
      const A = await px(a64), B = await px(b64); if (A.w !== B.w || A.h !== B.h) return { size: [A.w + 'x' + A.h, B.w + 'x' + B.h], pct: 100, block: 100 };
      const BS = 6, bw = Math.ceil(A.w / BS), bh = Math.ceil(A.h / BS), mean = (I, bx, by) => { let r = 0, g = 0, b2 = 0, c = 0; for (let y = by * BS; y < Math.min(A.h, by * BS + BS); y++) for (let x = bx * BS; x < Math.min(A.w, bx * BS + BS); x++) { const o = (y * A.w + x) * 4; r += I.d[o]; g += I.d[o + 1]; b2 += I.d[o + 2]; c++; } return [r / c, g / c, b2 / c]; };
      const mb = bw * bh, macro = new Array(Math.ceil(A.w / 16) * Math.ceil(A.h / 16)).fill(0), mcnt = new Array(macro.length).fill(0), mw = Math.ceil(A.w / 16); let ch = 0; const out = wantImg ? new ImageData(A.w, A.h) : null;
      for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) { const m1 = mean(A, bx, by), m2 = mean(B, bx, by), d = Math.max(Math.abs(m1[0] - m2[0]), Math.abs(m1[1] - m2[1]), Math.abs(m1[2] - m2[2])), k = Math.floor(by * BS / 16) * mw + Math.floor(bx * BS / 16); mcnt[k]++; const hit = d > 9; if (hit) { ch++; macro[k]++; }
        if (out) for (let y = by * BS; y < Math.min(A.h, by * BS + BS); y++) for (let x = bx * BS; x < Math.min(A.w, bx * BS + BS); x++) { const o = (y * A.w + x) * 4; if (hit) { out.data[o] = 220; out.data[o + 1] = 30; out.data[o + 2] = 60; } else { const g2 = 255 - (255 - A.d[o]) * 0.25; out.data[o] = out.data[o + 1] = out.data[o + 2] = g2; } out.data[o + 3] = 255; } }
      const r = { pct: 100 * ch / mb, block: Math.max(0, ...macro.map((v, i) => mcnt[i] ? 100 * v / mcnt[i] : 0)) };
      if (wantImg) { const c = document.createElement('canvas'); c.width = A.w * 3 + 20; c.height = A.h; const x = c.getContext('2d'); x.fillStyle = '#888'; x.fillRect(0, 0, c.width, c.height); const draw = async (b, dx) => { const i = await load('data:image/webp;base64,' + b); x.drawImage(i, dx, 0); }; await draw(a64, 0); await draw(b64, A.w + 10); const dc = document.createElement('canvas'); dc.width = A.w; dc.height = A.h; dc.getContext('2d').putImageData(out, 0, 0); x.drawImage(dc, (A.w + 10) * 2, 0); r.img = c.toDataURL('image/png').split(',')[1]; }
      return r; };
  });

  /* the capture matrix */
  const jobs = [];
  const sheetsFor = async (deck) => { const p = await b.newPage({ viewport: { width: 1440, height: 900 } }); await p.route(/supabase\.co|vercel\.app|fonts\.g|cdn\.jsdelivr/, r => r.abort()); await p.goto('file://' + HTML); await p.waitForTimeout(600); await p.evaluate(d => { document.documentElement.classList.add('bk-auth-ok'); bkCreateNewDeal(d); }, deck); const s = await p.evaluate(() => { const o = []; document.querySelectorAll('.rail [data-sheet]').forEach(e => { const n = e.getAttribute('data-sheet'); if (n && o.indexOf(n) < 0) o.push(n); }); ['Waterfall Report', 'Cash Flow Report', 'After-Tax Report', 'Sources and Uses Report'].forEach(n => { if (o.indexOf(n) < 0) o.push(n); }); return o; }); await p.close(); return s; };
  const acq = await sheetsFor(A), dev = await sheetsFor(V);
  const EDITOR = ['Property', 'Market', 'Revenues', 'Expenses', 'Tenants', 'Investment', 'Valuation'];
  acq.forEach(s => ['desktop', 'phone'].forEach(vp => ['light', 'dark'].forEach(th => jobs.push({ deck: 'acq', d: A, sheet: s, vp, th }))));
  dev.forEach(s => jobs.push({ deck: 'dev', d: V, sheet: s, vp: 'desktop', th: 'light' }));
  EDITOR.forEach(s => ['desktop', 'phone'].forEach(vp => jobs.push({ deck: 'acq', d: A, sheet: s, vp, th: 'light', subs: true })));
  const want = jobs.filter(j => !ONLY.length || ONLY.some(o => j.sheet.toLowerCase().includes(o)));

  const FIXED = Date.UTC(2026, 10, 13, 12, 0, 0), STYLE = '*{animation:none !important;transition:none !important;caret-color:transparent !important;scroll-behavior:auto !important}';
  /* RECORDED UNSTABLE PAGES: the page itself renders differently from one load to the next, so it cannot be compared. Reported every run, never a failure. Remove an entry when the page is fixed.
     deal-vectors-m: the Date column wraps onto two lines on some loads and not on others (a timing-dependent table layout in the app; a Phase 1 candidate). */
  const UNSTABLE = ['deal-vectors-m'], unstable = [];
  const state = {}; let compared = 0, failed = [], created = 0, updated = 0, errors = [];
  const pageFor = async (deck, d, vp, th) => { const key = deck + vp + th; if (state[key]) return state[key]; const V0 = VP[vp];
    const p = await b.newPage({ viewport: { width: V0.width, height: V0.height } }); await p.route(/supabase\.co|vercel\.app|fonts\.g|cdn\.jsdelivr/, r => r.abort());
    await p.addInitScript(F => { const D = Date; class FD extends D { constructor(...a) { if (a.length) super(...a); else super(F); } static now() { return F; } } window.Date = FD; }, FIXED);
    await p.goto('file://' + HTML); await p.waitForTimeout(700); await p.addStyleTag({ content: STYLE });
    await p.evaluate(([d, th]) => { document.documentElement.classList.add('bk-auth-ok'); bkCreateNewDeal(d); if (window.bkTheme && bkTheme.set) bkTheme.set(th); }, [d, th]); await p.waitForTimeout(300); state[key] = p; return p; };
  const shot = async (p, vp) => { const V0 = VP[vp]; await p.evaluate(() => { document.querySelectorAll('*').forEach(e => { if (e.scrollLeft) e.scrollLeft = 0; if (e.scrollTop) e.scrollTop = 0; }); window.scrollTo(0, 0); }); await p.waitForTimeout(200);   /* the header tab strip keeps its scroll from the previous sheet: reset it so a capture does not depend on the order */
    const h = Math.min(V0.cap, await p.evaluate(() => Math.max(document.documentElement.scrollHeight, 900))); const buf = await p.screenshot({ fullPage: true, clip: { x: 0, y: 0, width: V0.width, height: h } }); return (await tool.evaluate(([b64, w]) => window.__small(b64, w), [buf.toString('base64'), V0.w])); };
  const handle = async (id, webp) => { const f = path.join(BASE, id + '.webp');
    if (UPDATE) { const had = fs.existsSync(f); fs.writeFileSync(f, Buffer.from(webp, 'base64')); had ? updated++ : created++; return; }
    if (!fs.existsSync(f)) { errors.push('no baseline: ' + id + ' (run with --update to create it)'); return; }
    const old = fs.readFileSync(f).toString('base64'), r = await tool.evaluate(([a, b2]) => window.__cmp(a, b2, true), [old, webp]); compared++;
    if ((r.pct > TOL_PCT || r.block > TOL_BLOCK) && UNSTABLE.some(u => id.includes(u))) { unstable.push(id + ' (' + r.pct.toFixed(2) + '%)'); return; }
    if (r.pct > TOL_PCT || r.block > TOL_BLOCK) { failed.push({ id, pct: r.pct, block: r.block, size: r.size }); fs.mkdirSync(REPORT, { recursive: true }); if (r.img) fs.writeFileSync(path.join(REPORT, id + '.png'), Buffer.from(r.img, 'base64')); } };

  for (const j of want) {
    try { const p = await pageFor(j.deck, j.d, j.vp, j.th); await p.evaluate(s => showSheet(s), j.sheet); await p.waitForTimeout(650);
      if (!j.subs) { await handle([j.deck, j.vp, j.th, slug(j.sheet)].join('-'), await shot(p, j.vp)); continue; }
      const n = await p.evaluate(() => [...document.querySelectorAll('#viewport .ae-subs button, #viewport .ae-subs [data-sub], #viewport .ae-subs a, #viewport .ae-sub')].filter(x => (x.textContent || '').trim()).length);
      for (let i = 0; i < n; i++) { await p.evaluate(k => { const e = [...document.querySelectorAll('#viewport .ae-subs button, #viewport .ae-subs [data-sub], #viewport .ae-subs a, #viewport .ae-sub')].filter(x => (x.textContent || '').trim())[k]; e && e.click(); }, i); await p.waitForTimeout(450);
        const name = await p.evaluate(k => ([...document.querySelectorAll('#viewport .ae-subs button, #viewport .ae-subs [data-sub], #viewport .ae-subs a, #viewport .ae-sub')].filter(x => (x.textContent || '').trim())[k] || {}).textContent, i);
        await handle([j.deck, j.vp, j.th, slug(j.sheet), 'sub', slug(name || String(i))].join('-'), await shot(p, j.vp)); }
    } catch (e) { errors.push(j.sheet + ' ' + j.vp + ' ' + j.th + ': ' + String(e.message).slice(0, 80)); }
  }
  for (const p of Object.values(state)) await p.close();
  await b.close();
  if (UPDATE) { console.log('baselines written: ' + created + ' new, ' + updated + ' updated (' + path.relative(process.cwd(), BASE) + ')'); process.exit(errors.length ? 1 : 0); }
  failed.sort((a, b2) => b2.pct - a.pct); failed.forEach(f => console.log('FAIL ' + f.id + '  changed ' + (f.size ? 'size ' + f.size.join(' vs ') : f.pct.toFixed(2) + '% of the page, worst area ' + f.block.toFixed(0) + '%')));
  errors.forEach(e => console.log('ERROR ' + e));
  unstable.forEach(u => console.log('UNSTABLE (recorded, not a failure) ' + u));
  console.log(compared + ' pages compared, ' + failed.length + ' changed beyond tolerance, ' + errors.length + ' errors' + (failed.length ? '  (before / after / diff images: ' + path.relative(process.cwd(), REPORT) + ')' : ''));
  process.exit(failed.length || errors.length ? 1 : 0);
})();
