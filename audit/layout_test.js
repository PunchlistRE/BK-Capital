// Layout guards found by a visual pass: the "where each dollar goes" key never overlaps, report text has no stray entities or mangled percentages,
// the print button sits top right, the phone top bar does not collide, stacked analysis tables label every figure, stacked total rows stay readable.
// These are guards, not a substitute for looking at the pages (see audit/README.md, "Visual pass").
//   node audit/layout_test.js index.html
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); const path = require('path');
const A = require(path.join(__dirname, 'deal.js'));
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  let checks = 0, fails = 0; const check = (n, ok, d) => { checks++; if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? '  [' + d + ']' : '')); };
  const open = async (w) => { const p = await b.newPage({ viewport: { width: w, height: w < 600 ? 844 : 1000 } }); p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
    await p.route(/supabase\.co|vercel\.app|fonts\.g|cdn\.jsdelivr/, r => r.abort()); await p.goto('file://' + path.resolve(process.argv[2])); await p.waitForTimeout(700);
    await p.evaluate(() => document.documentElement.classList.add('bk-auth-ok')); await p.evaluate((A) => { bkCreateNewDeal(A); const s = bkLoad(); Object.assign(s, A, { purchasePrice: 19800000 }); bkSave(s); }, A); return p; };
  const show = (p, sh, ms) => p.evaluate(async ([sh, ms]) => { showSheet(sh); await new Promise(r => setTimeout(r, ms || 1300)); }, [sh, ms]);
  const p = await open(1440);

  /* the income bar's key: every label box is separate from every other, and the PDF summary uses the same chart */
  await show(p, 'Operating Underwrite');
  const key = await p.evaluate(() => { const svg = [...document.querySelectorAll('#viewport svg')].find(s => /Where each dollar/.test(s.getAttribute('aria-label') || '')); if (!svg) return null;
    const t = [...svg.querySelectorAll('text')].map(e => { const r = e.getBoundingClientRect(); return { s: e.textContent, l: r.left, r: r.right, t: r.top, b: r.bottom }; }).filter(x => x.r > x.l);
    let over = 0; for (let i = 0; i < t.length; i++) for (let j = i + 1; j < t.length; j++) { const a = t[i], c = t[j]; if (Math.min(a.r, c.r) - Math.max(a.l, c.l) > 1.5 && Math.min(a.b, c.b) - Math.max(a.t, c.t) > 1.5) over++; }
    return { n: t.length, over, text: t.map(x => x.s).join(' | ') }; });
  check('"Where each dollar goes": no two labels overlap, and each part is named with its dollars and share (two decimals)', key && key.over === 0 && /Insurance/.test(key.text) && /Management/.test(key.text) && /Reserves/.test(key.text) && /\$\d[\d,]* · \d+\.\d\d%/.test(key.text), key && (key.over + ' overlaps; ' + key.text.slice(0, 120)));
  const rep = await p.evaluate(() => bkReportHTML());
  check('the PDF summary carries the same key (names, dollars, shares) and no one-decimal percentages in its text', /Net cash after reserves/.test(rep) && /· \d+\.\d\d%/.test(rep) && !/>[^<]*\b\d+\.\d%/.test(rep.replace(/<style[\s\S]*?<\/style>/g, '')));

  /* the cash-flow report's figures never run into each other, and the spider chart's end labels are spaced */
  await show(p, 'Cash Flow Report', 1000);
  const crowd = await p.evaluate(() => [...document.querySelectorAll('#viewport .rp-tbl td')].filter(td => td.scrollWidth > td.clientWidth + 1).length);
  check('cash-flow report (desktop): no figure is wider than its column', crowd === 0, crowd);
  const tf = await p.evaluate(() => { const bg = q => getComputedStyle(document.querySelector('#viewport .rp-tbl ' + q)).backgroundColor; return { sec: bg('tr.sec td'), tot: bg('tr.tot td'), head: getComputedStyle(document.querySelector('#viewport .rp-tbl th')).backgroundColor }; });
  check('cash-flow report: a key total row is not filled like a heading row', tf.tot !== tf.sec && tf.tot !== tf.head, JSON.stringify(tf));
  await show(p, 'Sponsor CF', 1400);
  const sp4 = await p.evaluate(() => { const t = [...document.querySelectorAll('#viewport table.bk-sp4')]; const xs = t.map(x => [...x.rows[0].cells].map(c => Math.round(c.getBoundingClientRect().left))); const chipWrap = [...document.querySelectorAll('#viewport table.bk-sp4 .status-chip')].filter(c => c.getBoundingClientRect().height > 26).length;
    const yr = [...document.querySelectorAll('#viewport table.bk-yrs')].length; return { n: t.length, same: xs.every(r => r.join() === xs[0].join()), chipWrap, yr }; });
  check('sponsor page: the four-column tables share one grid, status chips stay on one line, and the annual table has equal year columns', sp4.n === 3 && sp4.same && sp4.chipWrap === 0 && sp4.yr >= 1, JSON.stringify(sp4));
  await show(p, 'Sensitivity', 1500);
  const sp = await p.evaluate(() => { const svg = [...document.querySelectorAll('#viewport svg')].find(s => /Spider chart/.test(s.getAttribute('aria-label') || '')); if (!svg) return null;
    const t = [...svg.querySelectorAll('text.lbl')].map(e => e.getBoundingClientRect()).sort((a, b) => a.top - b.top); let min = 99; for (let i = 1; i < t.length; i++) min = Math.min(min, t[i].top - t[i - 1].top); return { n: t.length, min }; });
  check('spider chart: end labels are at least 14 px apart', sp && sp.n > 3 && sp.min >= 14, JSON.stringify(sp));

  /* report pages: no literal entities, no mangled percentages */
  const texts = {}; for (const sh of ['Cash Flow Report', 'Valuation Report', 'Audit Report', 'Tenant Report']) { await show(p, sh, 900); texts[sh] = await p.evaluate(() => document.querySelector('#viewport').innerText); }
  check('report headers have no literal &middot; and use a real separator', Object.values(texts).every(t => !/&middot;|&amp;/.test(t)) && /Charlotte, NC · Multifamily/.test(texts['Cash Flow Report']));
  check('column headings are not mangled by the percentage rule ("Y1 % of EGR" stays that)', /Y1 % of EGR/.test(texts['Cash Flow Report']) && !/Y1\.00/.test(texts['Cash Flow Report']));

  /* the print button: top right of the header, not loose under the strip; not duplicated on report pages that have their own */
  await show(p, 'Sponsor CF');
  const pb = await p.evaluate(() => { const tb = document.querySelector('#viewport .title-block'), b = tb.querySelector('.bk-print-btn'), k = tb.querySelector('.bk-key-wrap'), h = tb.querySelector('h2'); if (!b) return null; const r = b.getBoundingClientRect(), t = tb.getBoundingClientRect(), hh = h.getBoundingClientRect(), kk = k && k.getBoundingClientRect(); return { top: r.top - t.top, right: t.right - r.right, belowTitle: r.top >= hh.top - 4 && r.bottom <= hh.bottom + 60, leftOfKey: !kk || r.right <= kk.left + 1 }; });
  check('Print / Save PDF sits in the header band at the top right, beside the Colour key', pb && pb.top < 40 && pb.right > 100 && pb.leftOfKey, JSON.stringify(pb));
  await show(p, 'Cash Flow Report', 900); check('a report that has its own Print button does not get a second one', await p.evaluate(() => document.querySelectorAll('#viewport .bk-print-btn').length === 0));

  /* edit controls: a unit sits in its own slot and headers line up with the figures */
  await show(p, 'Credit Policy');
  const al = await p.evaluate(() => { const t = document.querySelector('#viewport table.fin'), th = [...t.tHead.rows[0].cells].find(c => /Value/.test(c.textContent)), i = th.cellIndex, tr = th.getBoundingClientRect(); const inps = [...t.tBodies[0].rows].map(r => r.cells[i] && r.cells[i].querySelector('input')).filter(Boolean); const edge = inps.map(x => { const r = x.getBoundingClientRect(), cs = getComputedStyle(x); return r.right - parseFloat(cs.paddingRight); }); const sp = [...t.querySelectorAll('.bk-sfx')].filter(s => s.textContent.trim()); const cell = th.getBoundingClientRect(); const spill = sp.filter(s => s.getBoundingClientRect().right > cell.right + 1).length; return { spread: Math.max(...edge) - Math.min(...edge), headRight: tr.right - parseFloat(getComputedStyle(th).paddingRight), figRight: edge[0], spill }; });
  check('Credit Policy: the figures end on one line, the unit never spills into the next column, and the header sits over the figures (within 8px)', al.spread < 1.5 && al.spill === 0 && Math.abs(al.headRight - al.figRight) < 8, JSON.stringify(al));
  /* key metrics read differently from header bands; status / result columns of chips are centred (header too), a mixed N/A column stays left */
  await show(p, 'Portfolio Dashboard', 900);
  const kc = await p.evaluate(() => { const row = [...document.querySelectorAll('#viewport tr')].find(r => /Equity-Weighted Levered IRR|Equity - Weighted Levered IRR/.test(r.textContent.replace(/\s+/g, ' ')) || /Weighted Levered IRR/.test(r.textContent)); const cap = document.querySelector('#viewport table.fin caption, #viewport table.fin th'); if (!row) return null; return { row: getComputedStyle(row.cells[0]).backgroundColor, head: getComputedStyle(cap).backgroundImage + getComputedStyle(cap).backgroundColor }; });
  const tone = c => { const n = c.match(/\d+/g).map(Number); return { r: n[0], g: n[1], b: n[2] }; };
  check('a key-metric row (weighted IRR) is a warm band: more red than blue, unlike the blue-grey header bands', kc && (t => t.r > t.b + 10)(tone(kc.row)), kc && kc.row);
  await show(p, 'QA', 1200);
  const qa = await p.evaluate(() => { const t = [...document.querySelectorAll('#viewport table.fin')].find(x => /Engine Self-Tests/.test(x.caption ? x.caption.textContent : '')); const hi = [...t.tHead.rows[0].cells].findIndex(c => /Result/.test(c.textContent)); const cells = [...t.tBodies[0].rows].map(r => getComputedStyle(r.cells[hi]).textAlign); const g = [...document.querySelectorAll('#viewport table.fin')].find(x => /Certification Gates/.test(x.caption ? x.caption.textContent : '')); const gv = [...g.tBodies[0].rows].map(r => getComputedStyle(r.cells[1]).textAlign); return { head: getComputedStyle(t.tHead.rows[0].cells[hi]).textAlign, cells, gv }; });
  check('QA: the Result column of chips is centred, header included', qa.head === 'center' && qa.cells.every(a => a === 'center'), JSON.stringify(qa));
  check('QA: the mixed N/A / text column in Certification Gates is left-aligned', qa.gv.every(a => a === 'left' || a === 'start'), JSON.stringify(qa.gv));
  check('desktop: no page errors', p.errs.length === 0, p.errs.slice(0, 2).join(' | '));
  await p.close();

  /* phone */
  const m = await open(390);
  await show(m, 'Returns', 1000);
  const bar = await m.evaluate(() => { const bar = document.querySelector('.brand-bar'), kids = [...bar.querySelectorAll('.brand-mark, #pl-guide-toggle, .pl-search, .pl-user')].map(e => e.getBoundingClientRect()).filter(r => r.width > 0); let over = 0; for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) if (Math.min(kids[i].right, kids[j].right) - Math.max(kids[i].left, kids[j].left) > 1) over++; return { over, width: document.documentElement.scrollWidth }; });
  check('phone: the top bar does not overlap itself and the page does not scroll sideways', bar.over === 0 && bar.width <= 392, JSON.stringify(bar));
  await show(m, 'Equity Waterfall', 1600);
  const st = await m.evaluate(() => { const lab = [...document.querySelectorAll('#viewport table.bk-stk td[data-l]')], hurdle = lab.filter(c => /Hurdle IRR|Replayed|Still owed|Result|Detail/.test(c.getAttribute('data-l'))).length; const checkRows = [...document.querySelectorAll('#viewport table.bk-stk tr')].filter(r => /Tiers are paid in order/.test(r.textContent))[0]; const lbls = checkRows ? [...checkRows.querySelectorAll('td[data-l]')].map(c => c.getAttribute('data-l')) : []; const dark = [...document.querySelectorAll('#viewport table.fin.bk-m-stack tr.grandtotal')].map(r => getComputedStyle(r).backgroundColor); return { labelled: lab.length, hurdle, checkLbls: lbls, dark }; });
  check('phone: the verification and breakdown tables stack with every figure labelled by its column, and a check row is labelled Result / Detail (not by the hurdle columns)', st.labelled > 10 && st.checkLbls.includes('Result') && st.checkLbls.includes('Detail') && !st.checkLbls.includes('Hurdle IRR'), JSON.stringify(st.checkLbls));
  check('phone: stacked total / highlighted rows are a light band (no dark band with light boxes inside)', st.dark.every(c => { const n = c.match(/\d+/g).map(Number); return n[0] > 200 && n[1] > 200 && n[2] > 200; }), st.dark.join(' '));
  await show(m, 'Financing Compare', 1200);
  const fc = await m.evaluate(() => { const t = [...document.querySelectorAll('#viewport table.bk-stk')].find(x => /Initial loan proceeds/.test(x.textContent)); if (!t) return null; const r = [...t.rows].find(x => /Initial loan proceeds/.test(x.textContent)); const v = r.querySelector('td[data-l]'); return { value: v && v.textContent, visible: v && v.getBoundingClientRect().right <= window.innerWidth + 1 && v.getBoundingClientRect().left >= 0 }; });
  check('phone: the financing comparison shows each figure beside its alternative\'s name, inside the screen', fc && fc.visible && /\$/.test(fc.value), JSON.stringify(fc));
  /* third visual pass */
  await show(m, 'Cash Flow Report', 1200);
  const cf = await m.evaluate(() => { const t = document.querySelector('#viewport .rp-tbl'); const td = t.querySelectorAll('tbody tr:not(.sec) td')[1]; return { tdw: td.offsetWidth, scroll: t.scrollWidth > t.clientWidth + 5 }; });
  check('phone: the cash-flow report scrolls sideways with readable columns instead of overprinting them', cf.tdw >= 60 && cf.scroll, JSON.stringify(cf));
  await show(m, 'Debt', 1200);
  const di = await m.evaluate(() => { const i = document.querySelector('#viewport input[placeholder=off]'); const td = i.closest('td'), cs = getComputedStyle(td); return { box: cs.boxShadow !== 'none', row: !!i.closest('tr.input'), w: i.offsetWidth }; });
  check('phone: the empty minimum-debt-yield field is a visible boxed input', di.box && di.row && di.w > 60, JSON.stringify(di));
  await show(m, 'Expenses', 1300);
  const ex = await m.evaluate(() => { const i = document.querySelector('.ae-grid td input.num'); return { w: i.offsetWidth, clipped: i.scrollWidth > i.clientWidth + 1 }; });
  check('phone: expense amounts in the editor grid are not clipped', ex.w >= 90 && !ex.clipped, JSON.stringify(ex));
  const br = await m.evaluate(() => { const w = document.querySelector('.brand-mark .word'); return { sw: w.scrollWidth, cw: w.clientWidth }; });
  check('phone: the brand name is shown in full', br.sw <= br.cw + 1, JSON.stringify(br));
  await show(m, 'Valuation Report', 1200);
  const vw = await m.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: document.documentElement.clientWidth }));
  check('phone: the valuation report does not widen the page (its tables scroll inside themselves)', vw.sw <= vw.w + 1, JSON.stringify(vw));
  /* Deal Underwrite: the section index is grouped and labelled, every name is distinct, and the section being read is marked */
  const d = await open(1280); await show(d, 'Deal Underwrite');
  const du = await d.evaluate(() => { const bar = document.querySelector('#viewport .bk-dui'); if (!bar) return null; const btns = [...bar.querySelectorAll('button[data-bk-jump]')], names = btns.map(b => b.textContent.trim()), r = bar.getBoundingClientRect();
    return { groups: [...bar.querySelectorAll('.bk-dgl')].map(x => x.textContent.trim()), n: btns.length, dup: names.length - new Set(names).size, on: bar.querySelectorAll('button.on').length, h: Math.round(r.height), pos: getComputedStyle(bar).position, first: btns[0].classList.contains('on'), targets: btns.every(b => document.getElementById(b.getAttribute('data-bk-jump'))) }; });
  check('Deal Underwrite index: grouped under labels, every name distinct, one section marked, every link has a target', du && du.groups.length >= 6 && du.n >= 18 && du.dup === 0 && du.on === 1 && du.first && du.targets, JSON.stringify(du));
  check('Deal Underwrite index: a normal block (not pinned over the form) and not a tall wall', du && du.pos !== 'sticky' && du.pos !== 'fixed' && du.h < 300, JSON.stringify(du));
  await d.evaluate(async () => { const t = document.getElementById(document.querySelectorAll('#viewport .bk-dui button[data-bk-jump]')[6].getAttribute('data-bk-jump')); t.scrollIntoView(); window.scrollBy(0, -170); await new Promise(r => setTimeout(r, 500)); });
  const du2 = await d.evaluate(() => { const on = [...document.querySelectorAll('#viewport .bk-dui button.on')]; return { n: on.length, name: on[0] && on[0].textContent.trim() }; });
  check('Deal Underwrite index: scrolling to a section marks that section', du2.n === 1 && du2.name !== 'Identity', JSON.stringify(du2)); await d.close();
  check('phone: no page errors', m.errs.length === 0, m.errs.slice(0, 2).join(' | '));
  console.log(checks + ' checks, ' + fails + ' failures'); await b.close(); process.exit(fails ? 1 : 0);
})();
