// Before / after evidence for a polish pass: the same sheet, deck, width and element on two builds, side by side in one PNG per item.
//   node audit/qa/evidence.js <before index.html> <after index.html> <out dir>
// Each item names a sheet, a deck, a viewport width and a CSS selector (the first match is captured, with a margin), or a scroll position for a plain viewport capture.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); const path = require('path'), fs = require('fs');
const A = require('../deal.js'), V = require('../devdeal.js');
const [BEFORE, AFTER, OUT] = process.argv.slice(2).map((p) => path.resolve(p));
const ITEMS = [
  ['phone_flow_bar', 'acq', 390, 'Debt', '.bk-flow'],
  ['phone_ribbon', 'acq', 390, 'Liquidity', '.bk-ribbon'],
  ['chart_card_edge', 'acq', 1440, 'Returns', '.pf-card'],
  ['phone_sensitivity_tornado', 'acq', 390, 'Sensitivity', '.bk-sx-svgwrap'],
  ['phone_model_checks_action', 'acq', 390, 'Model Checks', 'table.bk-mc tbody tr'],
  ['phone_deal_documents_photo', 'acq', 390, 'Deal Documents', '.card.bk-docphoto, #viewport .card'],
  ['source_data_sidebar', 'acq', 1440, 'Source Data', '.side-col .card:last-of-type, .side-col'],
];
(async () => {
  fs.mkdirSync(OUT, { recursive: true }); const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const shot = async (file, [name, dk, w, sheet, sel]) => {
    const p = await b.newPage({ viewport: { width: w, height: 900 }, deviceScaleFactor: 2 });
    await p.route(/supabase\.co|vercel\.app|fonts\.g|cdn\.jsdelivr/, (r) => r.abort()); await p.goto('file://' + file); await p.waitForTimeout(700);
    await p.evaluate(([d, sh]) => { document.documentElement.classList.add('bk-auth-ok'); bkCreateNewDeal(d); const s = bkLoad(); Object.assign(s, d); bkSave(s); showSheet(sh); }, [dk === 'dev' ? V : A, sheet]); await p.waitForTimeout(900);
    const box = await p.evaluate((sel) => { const e = sel.split(',').map((q) => document.querySelector(q.trim())).filter(Boolean)[0]; if (!e) return null; e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }, sel);
    await p.waitForTimeout(200); const out = path.join(OUT, '_' + path.basename(path.dirname(file)) + '_' + name + '.png');
    const vw = w, clip = box ? { x: Math.max(0, box.x - 8), y: Math.max(0, box.y - 8), width: Math.min(vw - Math.max(0, box.x - 8), box.w + 16 + 40), height: Math.min(860, box.h + 16) } : undefined;
    await p.screenshot({ path: out, clip }); await p.close(); return out; };
  for (const it of ITEMS) { const bf = await shot(BEFORE, it), af = await shot(AFTER, it); console.log(it[0] + ': ' + bf + ' | ' + af); }
  await b.close();
})();
