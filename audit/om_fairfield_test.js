// Import OM, 18 Fairfield Avenue layout (a NorthEast Private Client Group OM): letter-spaced section headings ("O P E R A T I N G I N C O M E"), an income and expense table that prints
// four figures a row (Current, $/Unit, Pro Forma, $/Unit), a single-spaced unit mix and a unit-by-unit rent roll, and no asking price ("Subject to Offers"). The import used to take the
// $/Unit column as the pro forma (taxes $2,606, management 0.23%), read 7 units, and leave the rent roll behind. Page text in audit/fixtures/om_fairfield_pages is what the importer's
// reader returns for pages 2, 4, 19 and 20.   node audit/om_fairfield_test.js index.html
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); const path = require('path'), fs = require('fs');
const F = n => fs.readFileSync(path.join(__dirname, 'fixtures', 'om_fairfield_pages', n), 'utf8');
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const p = await b.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route(/supabase\.co|vercel\.app|fonts\.g|cdn\.jsdelivr/, r => r.abort());
  await p.goto('file://' + path.resolve(process.argv[2])); await p.waitForTimeout(700);
  await p.evaluate(() => document.documentElement.classList.add('bk-auth-ok'));
  let checks = 0, fails = 0; const check = (n, ok, d) => { checks++; if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? '  [' + String(d).slice(0, 300) + ']' : '')); };
  const pages = []; for (let i = 1; i <= 25; i++) pages.push('18 Fairfield Avenue\nNorwalk, CT 06854\nPhotos ' + i);
  pages[1] = F('fairfield_p2.txt'); pages[3] = F('fairfield_p4.txt'); pages[18] = F('fairfield_p19.txt'); pages[19] = F('fairfield_p20.txt');
  const run = (basis, price) => p.evaluate(([pages, basis, price]) => { bkCreateNewDeal({ name: 'x', dealId: 'X' }); const o = bkOMParse(pages), S = bkOMState(); S.om = o; S.basis = basis; S.dec = {}; S.mPrice = price; S.mCommSF = null;
    const bd = bkOMBuild(o, basis, 'fairfield.pdf'), conf = bkOMConf(o, bd, null, basis), I = o.ie || {};
    return { units: o.units, unitsFrom: o.unitsFrom, price: o.price, mix: o.unitMix, roll: o.unitRoll && { n: o.unitRoll.rows.length, check: o.unitRoll.check, first: o.unitRoll.rows[0], a3: o.unitRoll.rows[5] }, periods: I.periods, gsr: I.gsr, ltl: I.ltl, vac: I.vac, egi: I.egi, expTot: I.expTot, noi: I.noi, exp: I.exp, addTot: I.addTot,
      recon: I.recon, deal: bd.deal, tie: bd.tie, want: bd.want, needs: (bd.needs || []).map(n => n.key), notes: bd.notes, sum: conf.sum, band: typeof bkMarketBand === 'function' ? bkMarketBand('goingIn') : null }; }, [pages, basis, price]);
  const c = await run('cur', 5300000);
  check('units: 18, from the unit mix (not the 7 a loose phrase on page 2 gave)', c.units === 18, JSON.stringify([c.units, c.unitsFrom]));
  check('the single-spaced unit mix is read: 5 types adding to 18 units, with current, high-achieved and pro forma rents', c.mix.length === 5 && c.mix.reduce((t, m) => t + m.units, 0) === 18 && c.mix[2].type === '1 Bedroom - Large' && c.mix[2].units === 11 && c.mix[2].cur === 2107 && c.mix[2].high === 2340 && c.mix[2].pf === 2500, JSON.stringify(c.mix));
  check('the unit-by-unit rent roll is read: 18 units adding to the OM\'s monthly totals ($36,879 current, $44,050 pro forma); BA1 is vacant; lease dates kept', c.roll && c.roll.n === 18 && c.roll.check.cur.ok && c.roll.check.pf.ok && c.roll.first.unit === 'BA1' && c.roll.first.vacant && c.roll.a3.unit === 'A3' && c.roll.a3.leaseEnd === '2027-02-28' && c.roll.a3.sf === 1026, JSON.stringify(c.roll));
  check('the income table with four figures a row is read by column: expenses $130,192 current and $138,668 pro forma (not the $/Unit figures)', c.periods.join() === 'cur,pf' && c.expTot.cur === 130192 && c.expTot.pf === 138668 && c.exp.length === 12 && c.exp[1].label === 'Real Estate Tax' && c.exp[1].cur === 46906 && c.exp[1].pf === 50668, JSON.stringify([c.expTot, c.exp && c.exp[1]]));
  check('the income build: gross scheduled rent $442,548 / $528,600, below-market rent $86,052 as loss to lease (not other income), vacancy 3%, other income $5,700 / $16,500, NOI $304,779 / $390,574', c.gsr.cur === 442548 && c.gsr.pf === 528600 && c.ltl.cur === 86052 && c.vac.curPct === 0.03 && c.addTot.cur === 5700 && c.addTot.pf === 16500 && c.noi.cur === 304779 && c.noi.pf === 390574, JSON.stringify([c.gsr, c.ltl, c.vac, c.addTot, c.noi]));
  check('every printed total ties in both columns', ['cur', 'pf'].every(k => (c.recon[k] || []).length && c.recon[k].every(x => x.ok)), JSON.stringify(c.recon));
  check('the rent roll goes on the deal: 18 units, in-place rents, pro forma rents as market rents, the vacant unit at its asking rent', c.deal.rentRoll && c.deal.rentRoll.length === 18 && c.deal.rentRoll[0].status === 'Vacant' && c.deal.rentRoll[0].marketRent === 1800 && c.deal.rentRoll[1].inPlaceRent === 2300 && c.deal.rentRoll[1].marketRent === 2500 && c.deal.rentAppliedBasis === 'In-Place', JSON.stringify((c.deal.rentRoll || []).slice(0, 2)));
  check('current basis: the deal\'s NOI recomputes to the OM\'s $304,779 within $5, with annual figures (taxes $46,906, management 5%)', c.tie != null && Math.abs(c.tie - 304779) <= 5 && c.deal.taxes === 46906 && c.deal.mgmtPct === 0.05 && c.sum.low === 0, JSON.stringify([c.tie, c.deal.taxes, c.deal.mgmtPct, c.sum]));
  const f = await run('pf', 5300000);
  check('pro forma basis: the rent roll applies market rents and the deal\'s NOI recomputes to the OM\'s $390,574 within $5', f.deal.rentAppliedBasis === 'Market' && f.tie != null && Math.abs(f.tie - 390574) <= 5 && f.sum.low === 0, JSON.stringify([f.tie, f.deal.rentAppliedBasis, f.sum]));
  check('no asking price is invented ("Subject to Offers"); the market going-in cap band is available for the price suggestions', c.price == null && c.band && c.band.low > 0 && c.band.high > c.band.low, JSON.stringify([c.price, c.band]));
  check('no page errors', errs.length === 0, errs.join(' | '));
  console.log('om fairfield: ' + checks + ' checks, ' + fails + ' failures'); await b.close(); process.exit(fails ? 1 : 0);
})();
