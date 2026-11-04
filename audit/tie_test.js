// Funding tie tests: Sources & Uses, the Step-by-Step Guide, Debt, Funding and Returns read ONE calculation (bkFundingSummary, src/184) and must agree,
// on a development deal (Harbor Point, and the audit development deal) and an acquisition deal, each checked on its own.
//   node audit/tie_test.js index.html
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); const path = require('path');
const H = require(path.join(__dirname, 'harbor', 'deal.js')), V = require(path.join(__dirname, 'devdeal.js')), A = require(path.join(__dirname, 'deal.js'));
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined }); let checks = 0, fails = 0;
  const check = (n, ok, d) => { checks++; if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? '  [' + String(d).slice(0, 300) + ']' : '')); };
  const open = async (deal) => { const p = await b.newPage({ viewport: { width: 1400, height: 900 } }); p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
    await p.route(/supabase\.co|vercel\.app|fonts\.g|cdn\.jsdelivr/, r => r.abort()); await p.goto('file://' + path.resolve(process.argv[2])); await p.waitForTimeout(700);
    await p.evaluate((d) => { document.documentElement.classList.add('bk-auth-ok'); bkCreateNewDeal(d); const s = bkLoad(); Object.assign(s, d); bkSave(s); }, deal); return p; };
  const num = t => Number(String(t).replace(/[^0-9.\-]/g, ''));
  for (const [tag, deal, dev] of [['Harbor Point development', H, true], ['audit development deal', V, true], ['acquisition deal', A, false]]) {
    const p = await open(deal);
    const F = await p.evaluate(() => { const f = bkFundingSummary(); const d = bkDebt(), r = bkMonthlyReturns(), w = bkWaterfallV07(), sum = (a, k) => a.reduce((t, m) => t + (+m[k] || 0), 0);
      return { dev: f.dev, ties: f.ties.map(t => [t.id, t.ok]), uses: f.totalUses, srcs: f.totalSources, usesSum: f.uses.reduce((t, u) => t + u[1], 0), srcSum: f.sources.reduce((t, u) => t + u[1], 0), loan: f.loan, equity: f.equity, gp: f.gp, lp: f.lp, gpE: f.gpEquity, lpE: f.lpEquity,
        debtLoan: d.loan, debtEq: d.equity, cap: Number(f.s.rateCapCost) || 0, contrib: r.contrib, wf: Math.abs(w.lp.contrib) + Math.abs(w.gp.contrib), eqEngine: f.dev ? f.x.equityTotal : d.equity, commit: f.commit, gpShare: Number(f.s.gpShare) || 0, all: bkAllInputsTie() }; });
    check(tag + ': deal type read as ' + (dev ? 'development' : 'acquisition'), F.dev === dev);
    check(tag + ': every funding tie passes (' + F.ties.map(t => t[0] + (t[1] ? '' : ' FAIL')).join(', ') + ')', F.ties.every(t => t[1]));
    check(tag + ': total uses = sum of the use lines, total sources = sum of the source lines, and they agree to the dollar', Math.abs(F.uses - F.usesSum) < 0.5 && Math.abs(F.srcs - F.srcSum) < 0.5 && Math.abs(F.uses - F.srcs) < 1, [F.uses, F.srcs]);
    check(tag + ': equity at funding = the engine equity (' + (dev ? 'funding engine total equity requirement' : 'Debt page equity plus any rate cap') + ')', Math.abs(F.equity - (F.eqEngine + (dev ? 0 : F.cap))) < 1, [F.equity, F.eqEngine]);
    if (dev) check(tag + ': facility drawn plus capitalized interest is within the commitment', F.loan <= F.commit + 1, [F.loan, F.commit]);
    else check(tag + ': the loan in Sources equals the Debt page loan', Math.abs(F.loan - F.debtLoan) < 1, [F.loan, F.debtLoan]);
    check(tag + ': GP + LP contributions in the waterfall = the equity contributed in the returns', Math.abs(F.wf - F.contrib) < 1, [F.wf, F.contrib]);
    check(tag + ': GP + LP equity at funding = total equity at funding (GP share ' + (F.gpShare * 100).toFixed(1) + '% from Partnership)', Math.abs(F.gpE + F.lpE - F.equity) < 0.5 && Math.abs(F.gpE - F.equity * F.gpShare) < 0.5, [F.gpE, F.lpE]);
    check(tag + ': ALL INPUTS TIE reads ok (' + F.all.checks + ' checks)', F.all.ok === true && F.all.checks > 5, JSON.stringify(F.all.failed));
    /* the pages that show it */
    await p.evaluate(() => showSheet('Sources & Uses')); await p.waitForTimeout(500);
    const su = await p.evaluate(() => document.getElementById('viewport').innerText);
    const money = n => Math.round(n).toLocaleString('en-US');
    check(tag + ': the Sources & Uses page shows the same total uses and total sources', su.indexOf(money(F.uses)) > -1 && su.indexOf(money(F.srcs)) > -1, money(F.uses));
    check(tag + ': Sources & Uses has no GP-share (or any equity-split) input of its own', await p.evaluate(() => !document.querySelector('#viewport input[data-key=gpShare], #viewport [onchange*=gpShare]')));
    await p.evaluate(() => { bkGuideOn(); bkGuideGo('sources'); }); await p.waitForTimeout(600);
    const g = await p.evaluate(() => { const el = document.getElementById('gd-su'); return el ? { t: el.innerText, inputs: el.querySelectorAll('input,select,textarea').length } : null; });
    check(tag + ': the guide Sources & Uses step is read-only (no inputs) and shows the same figures', !!g && g.inputs === 0 && g.t.indexOf(money(F.uses)) > -1 && g.t.indexOf(money(F.equity)) > -1, g && g.t.slice(0, 120));
    await p.evaluate(() => { bkGuideGo('partners'); }); await p.waitForTimeout(500);
    check(tag + ': the GP equity share is edited in one place, on the guide Partnership step (the same field as Investment > Partnership)', await p.evaluate(() => !!document.querySelector('#gdi-gpShare, [id*=gpShare], [data-k=gpShare]')));
    await p.evaluate(() => { bkGuideOff(); showSheet('Home'); }); await p.waitForTimeout(500);
    const home = await p.evaluate(() => /all inputs tie/i.test(document.getElementById('viewport').innerText)); await p.evaluate(() => showSheet('Returns')); await p.waitForTimeout(500);
    const snap = await p.evaluate(() => ({ chip: /ALL INPUTS TIE/.test(document.body.innerText), bar: !!document.querySelector('#bk-kpibar') && /ALL INPUTS TIE/.test(document.getElementById('bk-kpibar').innerText) }));
    check(tag + ': ALL INPUTS TIE shows on the Home checklist, the Deal Snapshot and the key-figure bar', home && snap.chip && snap.bar, JSON.stringify([home, snap]));
    /* tamper: the indicator must fail visibly when a figure no longer ties */
    const t = await p.evaluate(() => { const o = window.bkMonthlyReturns; window.bkMonthlyReturns = function () { const r = o.apply(this, arguments); return Object.assign({}, r, { contrib: r.contrib + 5000 }); }; bkPerfClear(); const a = bkAllInputsTie(); window.bkMonthlyReturns = o; bkPerfClear(); return { ok: a.ok, n: a.failed.length }; });
    check(tag + ': tamper test: $5,000 added to the returns contributions makes the indicator fail (it is not a constant)', t.ok === false && t.n > 0, JSON.stringify(t));
    check(tag + ': no page errors', p.errs.length === 0, p.errs.join('|')); await p.close();
  }
  console.log('tie tests: ' + checks + ' checks, ' + fails + ' failures'); await b.close(); process.exit(fails ? 1 : 0);
})();
