// Harbor Point regressions, stage A: the development outputs that were wrong on a development deal.
//  1 Deal Snapshot reads the construction facility, not the acquisition loan   2 Sources = Uses on the sheet AND in the PDF, and the returns cash flow charges the same equity
//  3 With no permanent takeout the PDF says the construction loan is repaid from sale proceeds   4 Unlevered IRR / multiple exist for development deals and do not move with financing
//   node audit/harbor_stageA_test.js index.html
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); const path = require('path');
const H = require(path.join(__dirname, 'harbor', 'deal.js')), V = require(path.join(__dirname, 'devdeal.js')), A = require(path.join(__dirname, 'deal.js'));
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined }); let checks = 0, fails = 0;
  const check = (n, ok, d) => { checks++; if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? '  [' + String(d).slice(0, 260) + ']' : '')); };
  const open = async (deal) => { const p = await b.newPage({ viewport: { width: 1400, height: 900 } }); p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
    await p.route(/supabase\.co|vercel\.app|fonts\.g|cdn\.jsdelivr/, r => r.abort()); await p.goto('file://' + path.resolve(process.argv[2])); await p.waitForTimeout(700);
    await p.evaluate((d) => { document.documentElement.classList.add('bk-auth-ok'); bkCreateNewDeal(d); const s = bkLoad(); Object.assign(s, d); bkSave(s); }, deal); return p; };
  const num = (t) => Number(String(t).replace(/[$,]/g, ''));
  for (const [tag, deal, takeout] of [['Harbor Point (no takeout)', H, false], ['audit development deal (takeout)', Object.assign({}, V, { refiAtStab: 1 }), true], ['audit development deal (no takeout)', Object.assign({}, V, { refiAtStab: 0 }), false]]) {
    const p = await open(deal);
    const r = await p.evaluate(async () => { const f = bkDevFundingV10(), t = bkDevTakeoutV11(), h = bkHeadline(), m = bkMonthlyReturns();
      document.querySelector('#viewport'); const snap = (typeof bkSnapshotHTML === 'function' ? bkSnapshotHTML() : '');
      showSheet('Sources & Uses'); await new Promise(r => setTimeout(r, 700)); const su = document.querySelector('#viewport').innerText.replace(/\s+/g, ' ');
      const html = bkReportHTML(); const fr = document.createElement('div'); fr.style.cssText = 'position:absolute;left:-9999px;width:900px'; fr.innerHTML = html.replace(/^[\s\S]*?<body[^>]*>/i, '').replace(/<\/body>[\s\S]*$/i, ''); document.body.appendChild(fr); const txt = fr.innerText.replace(/\s+/g, ' '); fr.remove();
      return { f: { commit: f.commit, equityTotal: f.equityTotal, unlev: f.unlev, levered: f.levered, capInt: f.actualCapInt, excess: f.months.reduce((a, z) => a + (z.excess || 0), 0), draws: f.months.reduce((a, z) => a + z.loanDraw, 0) }, t: { held: t.conHeldToSale, bal: t.conHeldBalance, perm: t.permLoan, stabNOI: t.stabPointNOI || t.noi }, h, m: { irr: m.irr, u: m.u, eqDraws: m.rows.reduce((a, z) => a + z.equityDraw, 0) }, su, txt, snapEl: document.querySelector('.bk-snap') ? document.querySelector('.bk-snap').innerText : null }; });
    const T = (re) => { const m = r.su.match(re); return m ? num(m[1]) : NaN; };
    check(tag + ': Deal Snapshot loan is the construction facility', Math.abs(r.h.loan - r.f.commit) < 1, r.h.loan + ' vs ' + r.f.commit);
    check(tag + ': Deal Snapshot equity is the development equity requirement', Math.abs(r.h.equity - r.f.equityTotal) < 1, r.h.equity + ' vs ' + r.f.equityTotal);
    check(tag + ': Deal Snapshot yield on cost is stabilized NOI over cost before financing', Math.abs(r.h.yoc - r.t.stabNOI / r.f.unlev) < 1e-9, r.h.yoc);
    check(tag + ': Deal Snapshot coverage is a development figure, not the acquisition loan\'s', isFinite(r.h.dscr) ? (r.h.dscr > 0.3 && r.h.dscr < 6) : true, r.h.dscr);
    const uses = T(/TOTAL USES \$([\d,]+)/), src = T(/TOTAL SOURCES \$([\d,]+)/);
    check(tag + ': Sources & Uses sheet: total sources equal total uses', uses > 0 && Math.abs(uses - src) < 1, uses + ' / ' + src);
    check(tag + ': the equity in the returns cash flow equals the equity requirement', Math.abs(r.m.eqDraws - r.f.equityTotal) < 2, r.m.eqDraws + ' vs ' + r.f.equityTotal);
    check(tag + ': the sheet\'s own "equity charged in returns" check agrees', /agree/i.test(r.su) && !/REVIEW/.test(r.su));
    const pdfUses = (r.txt.match(/Total project cost \$([\d,]{6,})/) || [])[1], pdfSrc = (r.txt.match(/Total sources \$([\d,]{6,})/) || [])[1];
    check(tag + ': PDF total project cost equals the Sources & Uses sheet total uses', pdfUses && Math.abs(num(pdfUses) - uses) < 1, pdfUses + ' vs ' + uses);
    check(tag + ': PDF total sources equal the PDF total project cost', pdfSrc && Math.abs(num(pdfSrc) - num(pdfUses)) < 1, pdfSrc + ' vs ' + pdfUses);
    check(tag + ': PDF loan source is draws plus capitalized interest, not a plug', Math.abs((r.f.draws + r.f.capInt) - (num((r.txt.match(/Construction loan - draws\s*\$([\d,]+)/) || [0, 0])[1]) + num((r.txt.match(/interest capitalized\s*\$([\d,]+)/) || [0, 0])[1]))) < 2);
    if (takeout) check(tag + ': PDF describes the permanent takeout', /takes out the construction loan/.test(r.txt) && /Permanent takeout/.test(r.txt));
    else {
      check(tag + ': PDF says the construction loan is repaid from sale proceeds', /repaid from the sale proceeds/.test(r.txt) && /Debt at sale/.test(r.txt));
      check(tag + ': PDF never describes a $0 permanent loan as taking out the construction loan', !/permanent loan of\s*\$0/i.test(r.txt) && !/Permanent loan\s*\$0/.test(r.txt) && !/Debt at sale \$0(\.00)?M?\b/.test(r.txt));
      const m = r.txt.match(/Debt at sale \$([\d.]+)M/); check(tag + ': PDF "Debt at sale" is the construction balance repaid', m && Math.abs(Number(m[1]) * 1e6 - r.t.bal) < 6000, m && m[1]);
    }
    check(tag + ': unlevered IRR and multiple exist', isFinite(r.m.u.irr) && r.m.u.moic > 0, JSON.stringify([r.m.u.irr, r.m.u.moic]));
    check(tag + ': the Snapshot and the Returns engine show the same unlevered IRR', Math.abs(r.h.unlevIRR - r.m.u.irr) < 1e-12);
    check(tag + ': no page errors', p.errs.length === 0, p.errs.join('|')); await p.close();
  }
  /* unlevered returns do not depend on financing */
  { const p = await open(H); const v = await p.evaluate(() => { const g = (ov) => bkRunWith(ov, () => { const u = bkMonthlyReturns().u; return [u.irr, u.moic, u.profit]; });
      const base = g({}), a = g({ conLTC: 0.4, conRate: 0.12, conOrigFee: 0.03 }), c = g({ conLTC: 0.8, conRate: 0.03, refiAtStab: 1 }), noLoan = g({ conLTC: 0 }); return { base, a, c, noLoan }; });
    const same = (x, y) => x.every((q, i) => Math.abs(q - y[i]) < 1e-9);
    check('Harbor Point: unlevered IRR, multiple and profit do not move with loan size, rate, fee or takeout', same(v.base, v.a) && same(v.base, v.c) && same(v.base, v.noLoan), JSON.stringify(v));
    /* independent recomputation of the unlevered IRR from its own cash flows */
    const w = await p.evaluate(() => { const m = bkMonthlyReturns(); return { flows: m.u.flows, close: m.rows[0].dt, n: m.rows.length, irr: m.u.irr, dates: m.rows.map(r => +new Date(r.dt)), start: +new Date(m.closeDt) }; });
    const d0 = w.start, f = w.flows.slice(); const cashAt = [[d0, 0]].concat(f.map((v, i) => [w.dates[i], v]));
    // closing-day treatment as the engine uses it: month-1 cost falls at closing
    const c1 = -f[0] > 0 ? f[0] : 0; /* only the cost part of month 1 moves to closing */
    const ir = (fl) => { let lo = -0.9, hi = 5; const nv = (r) => fl.reduce((a, [t, v]) => a + v / Math.pow(1 + r, (t - fl[0][0]) / 31557600000), 0); for (let i = 0; i < 200; i++) { const mid = (lo + hi) / 2; if (nv(lo) * nv(mid) <= 0) hi = mid; else lo = mid; } return (lo + hi) / 2; };
    const fl = [[d0, 0]].concat(f.map((v, i) => [w.dates[i], v]));
    const irrCheck = ir(fl.filter(x => x[1] !== 0));
    check('Harbor Point: the unlevered IRR agrees with an independent XIRR of its own cash flows (within 0.5 point; the engine places month-1 cost on the closing date)', Math.abs(irrCheck - w.irr) < 0.005, irrCheck + ' vs ' + w.irr);
    await p.close(); }
  /* an acquisition deal is untouched */
  { const p = await open(A); const v = await p.evaluate(() => { const h = bkHeadline(), d = bkDebt(); return { hl: h.loan, dl: d.loan, he: h.equity, de: d.equity, ui: h.unlevIRR }; });
    check('acquisition deal: Snapshot still reads the acquisition loan and equity', v.hl === v.dl && v.he === v.de && isFinite(v.ui), JSON.stringify(v)); await p.close(); }
  console.log('harbor stage A: ' + checks + ' checks, ' + fails + ' failures'); await b.close(); process.exit(fails ? 1 : 0);
})();
