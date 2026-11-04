const { chromium } = require('playwright'); const path = require('path'); const fs = require('fs'); const BRIEF = process.argv[2] === 'brief', LABEL = require('./fixture_labels.js')[BRIEF ? 'brief' : 'base'], D = require(BRIEF ? './deal_brief.js' : './deal.js');   // node pdf.js [brief]: the deal-brief fixture writes Harbor_Point_Brief_Investor_Summary.pdf and leaves the text dumps alone
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1400, height: 900 } }); p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
  await p.route(/supabase\.co|vercel\.app|fonts\.g|cdn\.jsdelivr/, r => r.abort()); await p.goto('file://' + path.resolve(__dirname, '../../index.html')); await p.waitForTimeout(700);
  await p.evaluate(([d, lab]) => { document.documentElement.classList.add('bk-auth-ok'); localStorage.setItem('bk-pt-all', '1'); bkCreateNewDeal(d); const s = bkLoad(); Object.assign(s, d); s._fixture = lab; bkSave(s); }, [D, LABEL]);
  const html = await p.evaluate(() => bkReportHTML()); const doc = await b.newPage(); await doc.setContent(html); await doc.waitForTimeout(500);
  await doc.pdf({ path: path.join(__dirname, BRIEF ? 'Harbor_Point_Brief_Investor_Summary.pdf' : 'Harbor_Point_Investor_Summary.pdf'), preferCSSPageSize: true, printBackground: true });
  if (BRIEF) { console.log('brief pdf written', p.errs); await b.close(); return; }
  fs.writeFileSync(path.join(__dirname, 'report_text.txt'), await doc.evaluate(() => document.body.innerText));
  const sheets = await p.evaluate(() => (typeof BK_SHEETS !== 'undefined' ? BK_SHEETS : (window.bkSheetList ? bkSheetList() : Object.keys(RENDERERS))));
  let all = ''; for (const sh of sheets) { const t = await p.evaluate(async (n) => { try { showSheet(n); await new Promise(r => setTimeout(r, 500)); return document.querySelector('#viewport').innerText; } catch (e) { return 'ERR ' + e.message; } }, sh); all += '\n\n#### ' + sh + '\n' + t; }
  fs.writeFileSync(path.join(__dirname, 'sheets_text.txt'), all); console.log(sheets.length, 'sheets', p.errs); await b.close();
})();
