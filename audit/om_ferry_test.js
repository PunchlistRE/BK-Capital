// Import OM, 32 Ferry Street layout (a designed OM from a New Haven brokerage): the price sits in a banner tile with its label above it, the income table prints a dash for a
// nil Current figure, the unit mix has Current / High Achieved / Pro Forma rents and no percent column, and the price is under $1,000,000. Each of those used to leave the import
// with no price, a false "other income does not add up" decision and no unit mix. Page text in audit/fixtures/om_ferry_pages is what the importer's reader returns for pages 3, 5, 24, 25.
//   node audit/om_ferry_test.js index.html
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); const path = require('path'), fs = require('fs');
const F = n => fs.readFileSync(path.join(__dirname, 'fixtures', 'om_ferry_pages', n), 'utf8');
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const p = await b.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route(/supabase\.co|vercel\.app|fonts\.g|cdn\.jsdelivr/, r => r.abort());
  await p.goto('file://' + path.resolve(process.argv[2])); await p.waitForTimeout(700);
  await p.evaluate(() => document.documentElement.classList.add('bk-auth-ok'));
  let checks = 0, fails = 0; const check = (n, ok, d) => { checks++; if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? '  [' + String(d).slice(0, 260) + ']' : '')); };
  const pages = [F('ferry_p3.txt'), '', '', '', F('ferry_p5.txt')]; while (pages.length < 23) pages.push(''); pages.push(F('ferry_p24.txt'), F('ferry_p25.txt'));
  const r = await p.evaluate((pages) => { bkCreateNewDeal({ name: 'x', dealId: 'X' }); const o = bkOMParse(pages), S = bkOMState(); S.om = o; S.basis = 'cur'; S.dec = {}; S.mPrice = null; S.mCommSF = null;
    const mentions = (o.commSFMentions || []).map(m => m.sf + '@p' + m.page); S.mCommSF = [...new Set((o.commSFMentions || []).map(m => m.sf))].length === 1 ? o.commSFMentions[0].sf : null;
    const bd = bkOMBuild(o, 'cur', 'ferry.pdf'), conf = bkOMConf(o, bd, null, 'cur'), I = o.ie || {};
    return { price: o.price, method: o.priceMethod, cands: (o.priceCandidates || []).map(c => c.kind + ':' + c.value), srcPrice: o.sources.price, caps: o.capRates, units: o.units, mix: o.unitMix, avgCur: o.avgCur, avgPf: o.avgPf,
      addl: I.addl, addTot: I.addTot, recon: I.recon, nil: I.nil, noi: I.noi, mentions, tie: bd.tie, want: bd.want, priceConf: conf.fields.purchasePrice, gsf: conf.fields.gsf, unitsConf: conf.fields.units, sum: conf.sum, needs: (bd.needs || []).map(n => n.key), commRent: bd.deal.commercialRent, commArea: bd.deal.commercialArea }; }, pages);

  check('price: "Listing Price" tile with the figure on the row beneath is found: $775,000, one candidate, an asking price, read from the first page given (the Executive Summary)', r.price === 775000 && r.cands.join() === 'asking:775000' && r.srcPrice === 1 && r.method === 'figure under its label', JSON.stringify([r.price, r.cands, r.method]));
  check('the printed cap rates are read (14.36% in place, 16.15% pro forma) and the price is verified against NOI / price', r.caps && Math.abs(r.caps.cur - 0.1436) < 1e-9 && Math.abs(r.caps.pf - 0.1615) < 1e-9 && r.priceConf.l === 'verified', JSON.stringify([r.caps, r.priceConf]));
  check('the printed NOI figures are read: $111,284 current, $125,184 pro forma', r.noi.cur === 111284 && r.noi.pf === 125184, JSON.stringify(r.noi));
  check('a dash in the Current column is a nil: Garage is $0 current and $8,400 pro forma (not $8,400 in both)', r.addl.length === 1 && /Ga/.test(r.addl[0].label) && r.addl[0].cur === 0 && r.addl[0].pf === 8400 && r.addl[0].label.indexOf('-') < 0, JSON.stringify(r.addl));
  check('Total Additional Income is $0 current and $8,400 pro forma, so the other-income check ties instead of asking for a decision', r.addTot.cur === 0 && r.addTot.pf === 8400 && r.recon.cur.every(c => c.ok) && r.recon.pf.every(c => c.ok), JSON.stringify([r.addTot, r.recon.cur.map(c => c.ok), r.recon.pf.map(c => c.ok)]));
  check('the unit mix without a percent column is read: 2 x 1 BD at $1,568 and 10 x Room at $1,030, with high-achieved and pro forma rents', r.mix.length === 2 && r.mix[0].units === 2 && r.mix[0].cur === 1568 && r.mix[0].high === 1585 && r.mix[0].pf === 1650 && r.mix[1].type === 'Room' && r.mix[1].units === 10 && r.mix[1].cur === 1030 && r.mix[1].pf === 1150, JSON.stringify(r.mix));
  check('the Average row gives $1,119 current and $1,233 pro forma; the annual total row is not taken as a unit type', r.avgCur === 1119 && r.avgPf === 1233 && !r.mix.some(m => /total/i.test(m.type)), JSON.stringify([r.avgCur, r.avgPf]));
  check('units (12) reconcile with the unit mix', r.unitsConf.l === 'verified', JSON.stringify(r.unitsConf));
  check('the commercial area is stated once, however often (700 SF in the property summary and the commercial rent roll)', r.mentions.length >= 2 && new Set(r.mentions.map(x => x.split('@')[0])).size === 1 && r.mentions.some(x => /@p24/.test(x)), r.mentions.join());
  check('with that area the commercial rent is $26.14/SF on 700 SF and nothing is left to ask', r.needs.length === 0 && r.commArea === 700 && Math.abs(r.commRent - 26.14) < 0.01, JSON.stringify([r.needs, r.commArea, r.commRent]));
  check('the deal\'s NOI ties to the OM\'s printed in-place NOI within $5', r.tie != null && Math.abs(r.tie - r.want) <= 5, JSON.stringify([r.tie, r.want]));
  check('a rooming house (SROs) is not told its area is misread: building area is not Low', r.gsf.l !== 'low', JSON.stringify(r.gsf));
  check('nothing is marked Low or left unverified except the assumptions the OM does not state', r.sum.low === 0 && r.sum.check === 0, JSON.stringify(r.sum));

  /* the price pattern is no longer blind below $1,000,000 */
  const pr = (t) => p.evaluate((t) => { const o = bkOMParse([t]); return { price: o.price, c: (o.priceCandidates || []).map(c => c.kind + ':' + c.value + ':' + c.method) }; }, t);
  let q = await pr('Offering Summary\nAsking Price:   $650,000\nUnits   6');
  check('"Asking Price:   $650,000" on one line is read (it was ignored below $1,000,000)', q.price === 650000, JSON.stringify(q));
  q = await pr('Price to Sell:\n$895,000');
  check('a label on its own line with a $895,000 figure under it is read', q.price === 895000, JSON.stringify(q));
  q = await pr('Property Taxes   $11,131\nAssessed Value   $420,000\nLoan   $550,000\nSold Price   $480,000');
  check('assessed, loan and sold figures under $1,000,000 are never taken as the asking price', q.price === null && q.c.every(x => !/^asking/.test(x)), JSON.stringify(q));
  q = await pr('Listing Price  Total Rentable SF\n$775,000  4,047\nListing Price  Cap Rate\n$775,000  14.36%');
  check('the same figure printed twice is one price, not a conflict', q.price === 775000, JSON.stringify(q));
  q = await pr('Listing Price  Units\n$775,000  12\nAsking Price   $950,000');
  check('two different asking prices leave the price unset (no guess)', q.price === null, JSON.stringify(q));
  /* a unit mix with a square-foot column (Seabreeze) is read by its headings: the SF is not the unit count */
  const sea = await p.evaluate(() => { const o = bkOMParse(['Unit Mix\nUnit Type   # of Units   SF   Current Rent   Highest Achieved   Pro Forma Rent\nStudio   21   490   $1,100   $1,250   $1,400\nOne Bed   27   631   $1,288   $1,475   $1,650\nTwo Bed   12   807   $1,661   $1,850   $2,250\nAnnual Total   60   $933,617   $1,059,300   $1,211,400\nAverage   617   $1,304   $1,471   $1,683\n']); return { mix: o.unitMix, avgCur: o.avgCur, avgPf: o.avgPf }; });
  check('a unit mix with an SF column is read by its headings: 21 / 27 / 12 units (60), SF kept apart, the Average row is not a unit type', sea.mix.length === 3 && sea.mix.reduce((t, m) => t + m.units, 0) === 60 && sea.mix[0].sf === 490 && sea.mix[0].cur === 1100 && sea.mix[2].pf === 2250 && sea.avgCur === 1304 && sea.avgPf === 1683, JSON.stringify(sea));
  /* 45-47 Spring Street (same brokerage, older template): "Floor Plan" heading, an Average row with only the rents, and the building area printed as "Total SF:   11,424" while a suite is described as "3,585 SF" */
  const spr = await p.evaluate(() => { const o = bkOMParse(['Executive Summary\nOFFERING SUMMARY\nPrice:   $4,500,000\nCap Rate:   5.74%\nTotal SF:   11,424\nYear Built:   1895\nCommercial Space   1 Suite with 3,585 SF\n', 'Unit Mix\nResidential\nFloor Plan   # of Units   SF   Current   High Achieved   Pro Forma\n1 Bed   12   700   $1,831   $2,008   $2,250\nAnnual Total   12   10,740   $263,611   $289,152   $324,000\nAverage   $1,831   $2,008   $2,250\n']); return { sf: o.sf, mix: o.unitMix, avgCur: o.avgCur, avgPf: o.avgPf, price: o.price }; });
  check('Spring Street: the building area is "Total SF: 11,424", not the 3,585 SF suite mentioned in a table', spr.sf === 11424, spr.sf);
  check('Spring Street: a "Floor Plan" unit mix is read: 12 x 1 Bed at $1,831, high $2,008, pro forma $2,250; the Average row has only the rents', spr.mix.length === 1 && spr.mix[0].units === 12 && spr.mix[0].cur === 1831 && spr.mix[0].high === 2008 && spr.mix[0].pf === 2250 && spr.avgCur === 1831 && spr.avgPf === 2250, JSON.stringify(spr));
  check('no page errors', errs.length === 0, errs.join(' | '));
  console.log('om_ferry: ' + checks + ' checks, ' + fails + ' failures'); await b.close(); process.exit(fails ? 1 : 0);
})();
