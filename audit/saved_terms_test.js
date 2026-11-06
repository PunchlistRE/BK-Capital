// Saved deals and audit fixtures keep their original financing and waterfall terms. This branch changed how a NEW deal starts (all cash, one investor, only when a person starts it: blankStructure); nothing about
// the engine defaults (BK_BASE), the named template, or any deal created the old way may change. Compares this build with a reference build (default: origin/main before the change).
//   node audit/saved_terms_test.js index.html reference.html
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); const path = require('path');
const H = require(path.join(__dirname, 'harbor', 'deal.js')), B = require(path.join(__dirname, 'harbor', 'deal_brief.js')), V = require(path.join(__dirname, 'devdeal.js')), A = require(path.join(__dirname, 'deal.js'));
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined }); let checks = 0, fails = 0;
  const check = (n, ok, d) => { checks++; if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? '  [' + String(d).slice(0, 300) + ']' : '')); };
  const run = async (file) => { const p = await b.newPage(); await p.route(/supabase\.co|vercel\.app|fonts\.g|cdn\.jsdelivr/, r => r.abort()); await p.goto('file://' + path.resolve(file)); await p.waitForTimeout(700);
    return p.evaluate(([decks]) => { document.documentElement.classList.add('bk-auth-ok'); const out = { base: JSON.stringify(BK_BASE), tk: JSON.stringify(window.BK_TEMPLATE_KEYS), to: JSON.stringify(window.BK_TEMPLATE_OVERRIDES), tn: window.BK_TEMPLATE_NAME, decks: {} };
      for (const [k, d] of Object.entries(decks)) { bkCreateNewDeal(d); const s = bkLoad(); Object.assign(s, d); bkSave(s); const s2 = bkLoad(); const m = bkMonthlyReturns(); let w = null; try { w = bkWaterfallSummary(); } catch (e) {}
        out.decks[k] = { terms: [s2.acqLTV, s2.acqLTC, s2.acqRate, s2.acqAmort, s2.acqOrigFee, s2.closingCostsPct, s2.acqFeePct, s2.saleCostPct, s2.gpShare, s2.pref, s2.hurdle2, s2.hurdle3, s2.t2LP, s2.t3LP, s2.t4LP, s2.conLTC, s2.conRate], tpl: !!s2._template, irr: m.irr, moic: m.moic, contrib: m.contrib, dist: m.dist, lp: w && w.lp.irr, gp: w && w.gp.irr }; }
      /* a deal created the old way with only identity given: the template terms */
      bkCreateNewDeal({ name: 'Plain', dealId: 'PL', dealType: 'Acquisition' }); const t = bkLoad(); out.plain = [t.acqLTV, t.acqLTC, t.acqRate, t.closingCostsPct, t.gpShare, t.pref, t.t2LP, !!t._template];
      /* a saved deal that lacks a key resolves it from BK_BASE exactly as before */
      localStorage.setItem('bkcapital.cre.v02', JSON.stringify({ dealId: 'OLD', name: 'Saved Old', purchasePrice: 3000000, units: 10 })); out.legacy = (() => { const s = bkLoad(); return [s.acqLTV, s.closingCostsPct, s.gpShare, s.conRate]; })();
      return out; }, [{ harbor: H, brief: B, dev: V, acq: A }]); };
  const cur = await run(process.argv[2]), ref = await run(process.argv[3]);
  check('engine defaults (BK_BASE) are identical to the reference build', cur.base === ref.base);
  check('the named template (name, keys, overrides) is identical to the reference build', cur.tk === ref.tk && cur.to === ref.to && cur.tn === ref.tn, cur.tn);
  for (const k of Object.keys(ref.decks)) {
    const c = cur.decks[k], r = ref.decks[k];
    check(k + ' deck: financing, fee and waterfall terms are identical to the reference build', JSON.stringify(c.terms) === JSON.stringify(r.terms) && c.tpl === r.tpl, JSON.stringify([c.terms, r.terms]));
    check(k + ' deck: IRR, multiple, contributions, distributions and LP / GP IRR are identical (to the last digit)', c.irr === r.irr && c.moic === r.moic && c.contrib === r.contrib && c.dist === r.dist && c.lp === r.lp && c.gp === r.gp, JSON.stringify([c.irr, r.irr]));
  }
  /* owner's decision 1 (November 2026): a NEW acquisition starts with closing costs of 2% instead of the template's 5% (BK_TEMPLATE_OVERRIDES_ACQ; BK_BASE and the named template unchanged,
     checked above). Every other template term must still be exactly as before, and closing costs must be exactly 0.02 now against exactly 0.05 in the reference. */
  const CC = 3, others = (a) => a.filter((v, i) => i !== CC);
  check('a deal created without the new flag gets the same template terms as before, except closing costs, which are now 2% (owner\'s decision) where the reference had 5%', JSON.stringify(others(cur.plain)) === JSON.stringify(others(ref.plain)) && cur.plain[CC] === 0.02 && ref.plain[CC] === 0.05 && cur.plain[0] > 0, JSON.stringify([cur.plain, ref.plain]));
  check('a saved deal with missing keys resolves them from BK_BASE as before', JSON.stringify(cur.legacy) === JSON.stringify(ref.legacy), JSON.stringify([cur.legacy, ref.legacy]));
  console.log(checks + ' checks, ' + fails + ' failures'); await b.close(); process.exit(fails ? 1 : 0);
})();
