// The capital measures convention (audit/CAPITAL_MEASURES.md), enforced on what the app shows.
//
//   Closing equity               equity required at closing
//   Total contributed equity     all GP and LP capital actually contributed
//   Operating cash requirement   interim cash needed to cover operating shortfalls, and who funds it
//   Total project capitalization all sources of capital over the investment life
//
// Four different questions, four different numbers. They reconcile to the cash flows they are made of and are never forced to equal one another. This test renders EVERY sheet of each
// deck and checks, from the page itself:
//   1. the four names are the ones in BK_CAPITAL_TERMS and the shared calculation (bkFundingSummary().measures) reconciles (the ties capContrib and capTotal);
//   2. no ambiguous equity label ("Equity Required", "Equity Requirement", "Peak Equity", "Total Equity Called", "Equity at funding", ...) is shown anywhere;
//   3. wherever a row, a tile or a sidebar line is named EXACTLY by one of the four measures, its amount is that measure's amount (a name always means one number);
//   4. no reconciliation chip on any sheet of a valid deal reads VARIANCE, OVER COMMITMENT or OVER CEILING;
//   5. the Sources & Uses pages separate the closing view from the capital called after closing and total capitalization, and the investor PDF names the measures.
//   node audit/capital_measures_test.js index.html [--list]
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); const path = require('path');
const H = require(path.join(__dirname, 'harbor', 'deal.js')), V = require(path.join(__dirname, 'devdeal.js')), A = require(path.join(__dirname, 'deal.js'));
const LIST = process.argv.indexOf('--list') > 0, FILE = path.resolve(process.argv.find((a) => /\.html$/.test(a)) || 'index.html');
const NAMES = { closingEquity: 'Closing equity', totalContributedEquity: 'Total contributed equity', operatingCashRequirement: 'Operating cash requirement', totalProjectCapitalization: 'Total project capitalization' };
/* labels that name no particular measure; each one has been renamed to one of the four (or to a qualified phrase) */
const BANNED = [/^(total |peak |initial )?equity requirement\b/i, /^equity required\b/i, /^peak equity$/i, /^total equity( called| invested| contributions)?$/i, /^equity at funding\b/i, /^equity (called|contributed)$/i, /equity requirement \(peak contributed\)/i, /^peak \/ initial equity/i, /^total (lp|gp) equity$/i, /^equity invested\b/i, /^equity left at/i];
const IR = [{ name: 'Interest reserve', amount: 1000000, at: 'close', use: 'interest' }], OR = [{ name: 'Operating reserve', amount: 200000, at: 'close', use: 'operating' }];
const STATES = [['audit development deal', V, {}, true], ['Harbor Point', H, {}, true], ['acquisition deal', A, {}, true],
  ['audit development deal, 30% vacancy + operating reserve (ledger-funded lease-up deficit)', V, { vacancy: 0.3, initReserves: OR }, false], ['Harbor Point, interest reserve', H, { initReserves: IR }, false],
  ['audit development deal, 3-year hold (sale before stabilization)', V, { holdYears: 3 }, false], ['acquisition deal, refinance shortfall + rate cap', A, { refiAtMaturity: 1, debtTerm: 3, refiLTV: 0.35, rateCapCost: 150000 }, false]];
const KEY_SHEETS = ['Sources & Uses', 'Debt', 'Returns', 'Liquidity', 'Dev Draws', 'Model Checks', 'Equity Waterfall', 'Home'];
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined }); let checks = 0, fails = 0; const found = [];
  const check = (n, ok, d) => { checks++; if (!ok) fails++; if (!ok || !LIST) console.log((ok ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? '  [' + String(d).slice(0, 360) + ']' : '')); };
  const money = (t) => { const m = String(t).replace(/\s+/g, '').match(/^(\()?-?\$?([\d,]+(?:\.\d+)?)\)?$/); return m ? (/^\(/.test(String(t).trim()) || /^-/.test(String(t).trim()) ? -1 : 1) * Number(m[2].replace(/,/g, '')) : NaN; };
  const open = async (deal, ov) => { const p = await b.newPage({ viewport: { width: 1500, height: 1000 } }); p.errs = []; p.on('pageerror', (e) => p.errs.push(e.message));
    await p.route(/supabase\.co|vercel\.app|fonts\.g|cdn\.jsdelivr/, (r) => r.abort()); await p.goto('file://' + FILE); await p.waitForTimeout(700);
    await p.evaluate(([d, ov]) => { document.documentElement.classList.add('bk-auth-ok'); bkCreateNewDeal(d); const s = bkLoad(); Object.assign(s, d, ov); bkSave(s); }, [deal, ov]); return p; };
  /* 0. the registry */
  { const p = await open(V, {}); const T = await p.evaluate(() => JSON.parse(JSON.stringify(window.BK_CAPITAL_TERMS || null)));
    check('the four measure names are defined once, in BK_CAPITAL_TERMS, as the convention words them', !!T && Object.keys(NAMES).every((k) => T[k] && T[k].name === NAMES[k] && T[k].short), JSON.stringify(T)); await p.close(); }
  for (const [tag, deal, ov, allSheets] of STATES) {
    const p = await open(deal, ov);
    const M = await p.evaluate(() => { const F = bkFundingSummary(); return { dev: F.dev, m: F.measures ? { ce: F.measures.closingEquity.amount, tc: F.measures.totalContributedEquity.amount, oc: F.measures.operatingCashRequirement.amount, tp: F.measures.totalProjectCapitalization.amount, calls: F.measures.callsTotal, names: [F.measures.closingEquity.name, F.measures.totalContributedEquity.name, F.measures.operatingCashRequirement.name, F.measures.totalProjectCapitalization.name] } : null,
      ties: F.ties.filter((t) => /^cap/.test(t.id)).map((t) => [t.id, t.ok, t.a, t.b]), allOk: bkAllInputsTie().ok }; });
    check(tag + ': the shared calculation names and reconciles the four measures (ties ' + M.ties.map((t) => t[0]).join(', ') + ')', !!M.m && M.m.names.join('|') === Object.values(NAMES).join('|') && M.ties.length >= 2 && M.ties.every((t) => t[1]) && M.allOk, JSON.stringify(M.ties));
    check(tag + ': total contributed equity = closing equity + capital called after closing, and total project capitalization is larger than the closing view by the same calls', !!M.m && Math.abs(M.m.tc - (M.m.ce + M.m.calls)) < 1 && M.m.tp > M.m.ce, JSON.stringify(M.m));
    const sheets = allSheets ? await p.evaluate(() => Object.keys(RENDERERS)) : KEY_SHEETS;
    let nBanned = 0, nNamed = 0, nChip = 0, errs = 0;
    for (const sh of sheets) {
      const R = await p.evaluate(async (sh) => { try { showSheet(sh); } catch (e) { return { err: e.message }; } await new Promise((r) => setTimeout(r, 120)); const t = (e) => (e ? e.innerText.replace(/\s+/g, ' ').trim() : '');
        const pairs = []; document.querySelectorAll('tr').forEach((tr) => { const c = [...tr.children].map(t); if (c.length >= 2) pairs.push([c[0], c[1]]); });
        document.querySelectorAll('.metric-row').forEach((r) => pairs.push([t(r.querySelector('.k')), t(r.querySelector('.v'))])); document.querySelectorAll('.bk-tile').forEach((r) => pairs.push([t(r.querySelector('.kk')), t(r.querySelector('.kv'))]));
        const chips = [...document.querySelectorAll('.status-chip')].map(t).filter((x) => /^(VARIANCE|OVER COMMITMENT|OVER CEILING)$/i.test(x));
        return { pairs, chips, hasViewport: !!document.getElementById('viewport') }; }, sh);
      if (R.err) { errs++; continue; }
      R.pairs.forEach(([label, val]) => {
        if (BANNED.some((re) => re.test(label))) { nBanned++; found.push('ambiguous label "' + label + '" on ' + sh + ' (' + tag + ')'); }
        Object.keys(NAMES).forEach((k) => { if (label.toLowerCase() === NAMES[k].toLowerCase()) { const v = money(val); if (!isNaN(v)) { nNamed++; const want = { closingEquity: M.m.ce, totalContributedEquity: M.m.tc, operatingCashRequirement: M.m.oc, totalProjectCapitalization: M.m.tp }[k];
          if (Math.abs(v - want) > 1) found.push('"' + label + '" shows ' + val + ' on ' + sh + ' but the measure is $' + Math.round(want).toLocaleString('en-US') + ' (' + tag + ')'); } } }); });
      if (R.chips.length) { nChip += R.chips.length; found.push('reconciliation chip ' + R.chips.join(', ') + ' on ' + sh + ' (' + tag + ')'); }
    }
    const mine = found.filter((f) => f.indexOf('(' + tag + ')') > 0);
    check(tag + ': ' + sheets.length + ' sheets rendered with no page error; no ambiguous equity label; every row named by a measure shows that measure (' + nNamed + ' named rows seen); no VARIANCE / OVER COMMITMENT / OVER CEILING chip', errs === 0 && p.errs.length === 0 && mine.length === 0, mine.concat(p.errs).slice(0, 6).join(' | '));
    await p.close();
  }
  /* 5. the Sources & Uses pages and the PDF */
  { const p = await open(V, {}); await p.evaluate(() => showSheet('Sources & Uses')); await p.waitForTimeout(500);
    const t = await p.evaluate(() => document.getElementById('viewport').innerText.replace(/\s+/g, ' '));
    check('development Sources & Uses: the capital measures table, the lifecycle capitalization table and the operating cash requirement views (net and peak) are on the page, with the funding source named', /Capital Measures - four different questions/.test(t) && /Capitalization Over the Life of the Deal/.test(t) && /Net lease-up deficit funded in Sources/.test(t) && /Peak cumulative operating cash deficit/.test(t) && /Funded by .*Partners \$[\d,]+ \(LP \$[\d,]+, GP \$[\d,]+\)/.test(t), t.slice(t.indexOf('Capital Measures'), t.indexOf('Capital Measures') + 240));
    check('development Sources & Uses: the totals stay labelled TOTAL USES / TOTAL SOURCES (the closing funding plan) and the capital called after closing is a separate row', /TOTAL USES \$[\d,]+/.test(t) && /TOTAL SOURCES \$[\d,]+/.test(t) && /Capital called after closing/.test(t) && /TOTAL PROJECT CAPITALIZATION/.test(t));
    const pdf = await p.evaluate(() => bkReportHTML().replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '));
    check('development investor PDF: the cover names Closing equity, the funding page names Total contributed equity and Total project capitalization, and the old "Equity requirement" wording is gone', /Closing equity/.test(pdf) && /total contributed equity/i.test(pdf) && /Total project capitalization/i.test(pdf) && !/Equity requirement/.test(pdf), pdf.slice(pdf.indexOf('Closing equity') - 20, pdf.indexOf('Closing equity') + 160));
    await p.close(); }
  { const p = await open(A, { refiAtMaturity: 1, debtTerm: 3, refiLTV: 0.35, rateCapCost: 150000 }); await p.evaluate(() => showSheet('Sources & Uses')); await p.waitForTimeout(500);
    const t = await p.evaluate(() => document.getElementById('viewport').innerText.replace(/\s+/g, ' ')), F = await p.evaluate(() => { const f = bkFundingSummary(); return { uses: f.totalUses, calls: f.measures.callsTotal, tp: f.measures.totalProjectCapitalization.amount }; });
    const fm = (n) => Math.round(n).toLocaleString('en-US');
    check('acquisition Sources & Uses: the closing totals (with the rate cap) are labelled "AT CLOSING" and exclude the capital called after closing, which is its own row; total project capitalization is the larger figure, labelled as such',
      new RegExp('TOTAL USES AT CLOSING \\$' + fm(F.uses)).test(t) && new RegExp('TOTAL SOURCES AT CLOSING \\$' + fm(F.uses)).test(t) && /Refinance shortfall \$[\d,]+/.test(t) && new RegExp('TOTAL PROJECT CAPITALIZATION \\$' + fm(F.tp)).test(t) && F.tp > F.uses, t.slice(t.indexOf('TOTAL USES'), t.indexOf('TOTAL USES') + 120));
    const pdf = await p.evaluate(() => bkReportHTML().replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '));
    check('acquisition investor PDF: Sources & Uses shows the rate cap premium paid at closing and names the closing equity and the total contributed equity', /Rate cap premium/.test(pdf) && /Closing equity/.test(pdf) && /Total contributed equity/.test(pdf) && !/Equity invested/.test(pdf));
    await p.close(); }
  /* 6. the generated reports (the investor PDF and, for a development deal, the schedule report): the same two rules as the sheets - no ambiguous label, and a row or tile named by a measure carries that measure */
  for (const [tag, deal, ov] of [STATES[0], STATES[1], STATES[2], STATES[3], STATES[6]]) {
    const p = await open(deal, ov);
    const R = await p.evaluate(() => { const F = bkFundingSummary(), m = F.measures, out = { m: { closingEquity: m.closingEquity.amount, totalContributedEquity: m.totalContributedEquity.amount, operatingCashRequirement: m.operatingCashRequirement.amount, totalProjectCapitalization: m.totalProjectCapitalization.amount }, docs: [] };
      const html = [['investor PDF', bkReportHTML()]]; if (F.dev && typeof bkDevScheduleReportPages === 'function') { try { html.push(['development schedule report', [].concat(bkDevScheduleReportPages()).join('')]); } catch (e) {} }
      html.forEach(([name, h]) => { const doc = new DOMParser().parseFromString(h, 'text/html'), t = (e) => (e ? e.textContent.replace(/\s+/g, ' ').trim() : ''), pairs = [];
        doc.querySelectorAll('tr').forEach((tr) => { const c = [...tr.children].map(t); if (c.length >= 2) pairs.push([c[0], c[1]]); });
        doc.querySelectorAll('body *').forEach((e) => { if (!e.children.length && e.nextElementSibling) pairs.push([t(e), t(e.nextElementSibling)]); });
        out.docs.push({ name, pairs, n: pairs.length }); });
      return out; });
    let seen = 0; const bad = [];
    R.docs.forEach((d) => d.pairs.forEach(([label, val]) => {
      if (BANNED.some((re) => re.test(label))) bad.push('ambiguous label "' + label + '" in the ' + d.name);
      Object.keys(NAMES).forEach((k) => { if (label.toLowerCase() === NAMES[k].toLowerCase()) { const v = money(val); if (!isNaN(v)) { seen++; if (Math.abs(v - R.m[k]) > 1) bad.push('"' + label + '" shows ' + val + ' in the ' + d.name + ' but the measure is $' + Math.round(R.m[k]).toLocaleString('en-US')); } } }); }));
    check(tag + ': the generated reports (' + R.docs.map((d) => d.name).join(', ') + ') carry no ambiguous equity label, and every row named by a measure shows that measure (' + seen + ' named rows seen)', bad.length === 0 && seen > 0, bad.slice(0, 6).join(' | '));
    await p.close();
  }
  if (LIST) found.forEach((f) => console.log('FOUND ' + f));
  console.log('capital measures: ' + checks + ' checks, ' + fails + ' failures'); await b.close(); process.exit(fails ? 1 : 0);
})();
