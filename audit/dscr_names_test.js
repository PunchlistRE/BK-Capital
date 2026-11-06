// Two DSCRs, never a bare "DSCR" (owner's decision, November 2026). The house DSCR (NOI after reserves) is the firm's own credit-policy test, as the certified Capital
// Markets model; the lender DSCR (the deal's lender NOI) is the coverage the loan is sized and tested on. They are not interchangeable, so every page names which one it shows:
//  1. every visible "DSCR" on every sheet, in the investor PDF and on every Guide step, for an acquisition and a development, is named House or Lender;
//  2. the names carry their figures: the house DSCR on Credit Policy and Debt Capacity is the credit box's, the lender DSCR on Debt, Home and the Covenant Monitor is the engine's,
//     and on the audit deal they differ (so a reader could not have taken one for the other);
//  3. the house test does not move with the lender's NOI: where loan-to-value sets the loan, switching the lender basis to after reserves moves the lender DSCR and its label
//     and leaves the house DSCR, the house capacity and the credit gate's verdict exactly as they were.
//   node audit/dscr_names_test.js index.html
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); const path = require('path');
const A = require(path.join(__dirname, 'deal.js')), V = require(path.join(__dirname, 'devdeal.js'));
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  let checks = 0, fails = 0; const check = (n, ok, d) => { checks++; if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? '  [' + String(d).slice(0, 600) + ']' : '')); };
  const p = await b.newPage({ viewport: { width: 1440, height: 1000 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route(/supabase\.co|vercel\.app|fonts\.g|cdn\.jsdelivr/, r => r.abort()); await p.goto('file://' + path.resolve(process.argv[2])); await p.waitForTimeout(700);
  const x2 = (v) => (Math.round(v * 100) / 100).toFixed(2) + 'x';

  /* 1. the scan */
  const scan = await p.evaluate(async ([A, V]) => {
    document.documentElement.classList.add('bk-auth-ok'); const wait = ms => new Promise(r => setTimeout(r, ms)), found = [], seen = { sheets: 0, pdf: 0, guide: 0, named: 0 };
    const OK = /\b(house|lender)\s+(?:[\w-]+\s+)?$/i;
    const look = (where, text) => { text = text.replace(/\s+/g, ' '); const re = /\bDSCR\b/g; let m; while ((m = re.exec(text))) { if (OK.test(text.slice(Math.max(0, m.index - 40), m.index))) seen.named++; else found.push(where + ': …' + text.slice(Math.max(0, m.index - 70), m.index + 40) + '…'); } };
    const words = (root) => { const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: n => n.parentElement && n.parentElement.closest('code,script,style') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT }), out = []; while (tw.nextNode()) out.push(tw.currentNode.nodeValue); return out.join(' '); };
    for (const [tag, d] of [['acquisition', A], ['development', V]]) {
      bkCreateNewDeal(d); const s = bkLoad(); Object.assign(s, d); bkSave(s);
      for (const sh of Object.keys(RENDERERS)) { try { showSheet(sh); await wait(100); seen.sheets++; look(tag + ' / ' + sh, document.getElementById('viewport').innerText); const side = document.querySelector('.sidebar, #sidebar, aside'); if (side) look(tag + ' / ' + sh + ' (side panel)', side.innerText); } catch (e) { found.push(tag + ' / ' + sh + ' threw ' + e.message); } }
      const doc = new DOMParser().parseFromString(bkReportHTML(), 'text/html'); seen.pdf++; look(tag + ' / investor PDF', (() => { const tw = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT), o = []; while (tw.nextNode()) { const e = tw.currentNode.parentElement; if (!e || !e.closest('code,script,style')) o.push(tw.currentNode.nodeValue); } return o.join(' '); })());
      bkGuideOn(); for (const sec of bkGuideSections()) { bkGuideGo(sec.id); await wait(120); seen.guide++; look(tag + ' / Guide ' + sec.id, words(document.getElementById('viewport'))); } bkGuideGo('review'); await wait(200); seen.guide++; look(tag + ' / Guide review', words(document.getElementById('viewport'))); bkGuideOff();
    }
    return { found, seen }; }, [A, V]);
  check('every DSCR on every sheet (' + scan.seen.sheets + ' renders), the investor PDF and every Guide step (' + scan.seen.guide + ' screens), acquisition and development, is named House or Lender (' + scan.seen.named + ' named)', scan.found.length === 0 && scan.seen.named > 100 && scan.seen.sheets > 100, scan.found.slice(0, 8).join(' || '));

  /* 2 and 3. the names carry their figures, and the house test does not follow the lender's NOI */
  const READ = (over) => p.evaluate(async ([d, over]) => { const wait = ms => new Promise(r => setTimeout(r, ms)); bkCreateNewDeal(d); const s = bkLoad(); Object.assign(s, d, over); bkSave(s);
    const cap = bkDebtCapacity(), dd = bkDebt(), g = bkDealGate(), out = { lender: dd.dscr, house: cap.box.dscr, capacity: cap.capacity, loan: dd.loan, verdict: g.verdict, houseName: bkDscrName('house'), lenderName: bkDscrName('lender'), binding: bkBindingName('DSCR') };
    const rowOf = (re) => { const tr = [...document.querySelectorAll('#viewport tr')].find(r => re.test(((r.cells || [])[0] || {}).textContent || '')); return tr ? [...tr.cells].map(c => c.textContent.trim()) : null; };
    showSheet('Debt Capacity'); await wait(300); out.dcHouse = rowOf(/^House DSCR, first operating year \(NOI after reserves\)/);
    showSheet('IC Memo'); await wait(300); out.icText = document.getElementById('viewport').innerText.replace(/\s+/g, ' ');
    showSheet('Covenant Monitor'); await wait(300); const cov = rowOf(/^Lender DSCR \(min/); out.cov = cov ? cov[1] : null; out.covCap = ((document.querySelector('#viewport table caption') || {}).textContent || '');
    showSheet('Home'); await wait(300); const tile = [...document.querySelectorAll('.pl-kpi')].find(k => /DSCR/.test(k.querySelector('.k').textContent)); out.tile = tile ? [tile.querySelector('.k').textContent.trim(), tile.querySelector('.v').textContent.trim(), (tile.querySelector('.d, .s, small') || {}).textContent || tile.innerText] : null;
    return out; }, [A, over]);
  const base = await READ({}), ltvB = await READ({ acqLTV: 0.5 }), ltvA = await READ({ acqLTV: 0.5, lenderNoiBasis: 'after' });
  check('the names: House DSCR (NOI after reserves); Lender DSCR (lender NOI, before reserves), or after reserves when the deal says so; the engine\'s binding key "DSCR" shows as Lender DSCR', base.houseName === 'House DSCR (NOI after reserves)' && base.lenderName === 'Lender DSCR (lender NOI, before reserves)' && ltvA.lenderName === 'Lender DSCR (lender NOI, after reserves)' && base.binding === 'Lender DSCR', JSON.stringify([base.houseName, base.lenderName, ltvA.lenderName, base.binding]));
  check('Debt Capacity\'s policy test table prints the house DSCR the credit box computes, against the house minimum', !!base.dcHouse && base.dcHouse[1] === x2(base.house) && /1\.25x/.test(base.dcHouse[2]), JSON.stringify([base.dcHouse, base.house]));
  check('the IC memo names its credit-box figure the house DSCR and prints it', base.icText.indexOf('House DSCR (NOI after reserves) / debt yield / LTV, year 1 ' + x2(base.house)) >= 0, (base.icText.match(/House DSCR[^.]{0,80}/) || [''])[0]);
  check('the Covenant Monitor and the Overview tile print the engine\'s figure as the lender DSCR, with the basis named', base.cov === x2(base.lender) && base.covCap.indexOf(base.lenderName) >= 0 && !!base.tile && base.tile[0] === 'Lender DSCR, year 1' && base.tile[1] === x2(base.lender) && base.tile[2].indexOf('lender NOI, before reserves') >= 0, JSON.stringify([base.cov, base.covCap.slice(0, 90), base.tile]));
  check('on the audit deal the two differ (house ' + x2(base.house) + ', lender ' + x2(base.lender) + '): the label is what tells them apart', Math.abs(base.house - base.lender) > 0.01, JSON.stringify([base.house, base.lender]));
  check('where loan-to-value sets the loan, switching the lender basis to after reserves moves the lender DSCR (and its label) and leaves the house DSCR, the house capacity and the credit gate exactly as they were', ltvA.loan === ltvB.loan && ltvA.lender < ltvB.lender - 0.01 && ltvA.house === ltvB.house && ltvA.capacity === ltvB.capacity && ltvA.verdict === ltvB.verdict && ltvA.covCap.indexOf('after reserves') >= 0, JSON.stringify({ before: [ltvB.loan, ltvB.lender, ltvB.house, ltvB.capacity, ltvB.verdict], after: [ltvA.loan, ltvA.lender, ltvA.house, ltvA.capacity, ltvA.verdict] }));
  check('no page errors', errs.length === 0, errs.slice(0, 2).join(' | '));
  console.log(checks + ' checks, ' + fails + ' failures'); await b.close(); process.exit(fails ? 1 : 0);
})();
