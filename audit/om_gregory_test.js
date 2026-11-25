// Import OM, 509-515 Gregory Street layout (a designed Canva OM from a Fairfield, CT brokerage): the key figures sit in a banner with their labels printed UNDER them
// ("$1,175,000   5,676   6   6.87%   9.97%" over "Listing   Approx.   # of Units   Current Cap   Proforma Cap"), and one page carries the unit table and a two-column
// statement (Current, Proforma) with labels ending in ":" and expenses in parentheses. That import used to find no price, units, area, cap rates or income at all.
// The OM's own pro forma does not add up (its expense lines are $39,195, its printed total $36,695): that is reported, never corrected. Page text in
// audit/fixtures/om_gregory_pages is what the importer's reader returns for pages 1, 2, 3 and 7 (5 and 6 are photos).
//   node audit/om_gregory_test.js index.html
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); const path = require('path'), fs = require('fs');
const F = n => fs.readFileSync(path.join(__dirname, 'fixtures', 'om_gregory_pages', n), 'utf8');
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const p = await b.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route(/supabase\.co|vercel\.app|fonts\.g|cdn\.jsdelivr/, r => r.abort());
  await p.goto('file://' + path.resolve(process.argv[2])); await p.waitForTimeout(700);
  await p.evaluate(() => document.documentElement.classList.add('bk-auth-ok'));
  let checks = 0, fails = 0; const check = (n, ok, d) => { checks++; if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? '  [' + String(d).slice(0, 300) + ']' : '')); };
  const pages = [F('gregory_p1.txt'), F('gregory_p2.txt'), F('gregory_p3.txt'), '509-515 Gregory Street Bridgeport, CT\nPROPERTY PHOTOS', '509-515 Gregory Street Bridgeport, CT\nPROPERTY PHOTOS', '509-515 Gregory Street Bridgeport, CT\nPROPERTY PHOTOS', F('gregory_p7.txt')];
  const run = basis => p.evaluate(([pages, basis]) => { bkCreateNewDeal({ name: 'x', dealId: 'X' }); const o = bkOMParse(pages), S = bkOMState(); S.om = o; S.basis = basis; S.dec = {}; S.mPrice = null; S.mCommSF = null;
    const bd = bkOMBuild(o, basis, 'gregory.pdf'), conf = bkOMConf(o, bd, null, basis), I = o.ie || {};
    return { name: o.name, city: o.city, state: o.state, zip: o.zip, price: o.price, method: o.priceMethod, cands: (o.priceCandidates || []).map(c => c.kind + ':' + c.value), caps: o.capRates, units: o.units, sf: o.sf, lot: o.lotAcres,
      mix: o.unitMix, avgCur: o.avgCur, avgPf: o.avgPf, gsr: I.gsr, vac: I.vac, egi: I.egi, expTot: I.expTot, noi: I.noi, exp: I.exp, recon: I.recon, periods: I.periods,
      deal: bd.deal, tie: bd.tie, want: bd.want, needs: (bd.needs || []).map(n => n.key), notes: bd.notes, sum: conf.sum, fields: conf.fields }; }, [pages, basis]);
  const c = await run('cur');
  check('identity: 509-515 Gregory Street, Bridgeport, CT, ZIP 06604 (the property\'s, not 06824 from the broker\'s office address in the page footer)', c.name === '509-515 Gregory Street' && c.city === 'Bridgeport' && c.state === 'CT' && c.zip === '06604', JSON.stringify([c.name, c.city, c.state, c.zip]));
  check('price: the banner figure over its "Listing" label, $1,175,000, one asking-price candidate, read as a figure above its label', c.price === 1175000 && c.cands.join() === 'asking:1175000' && c.method === 'figure above its label', JSON.stringify([c.price, c.cands, c.method]));
  check('the banner\'s other figures: 6 units, 5,676 SF (Approx. Sq. Ft.), cap rates 6.87% current and 9.97% pro forma; the $207 price-per-SF tile is not taken for anything', c.units === 6 && c.sf === 5676 && Math.abs(c.caps.cur - 0.0687) < 1e-9 && Math.abs(c.caps.pf - 0.0997) < 1e-9, JSON.stringify([c.units, c.sf, c.caps]));
  check('the lot (0.12 acres) is read from the property details', c.lot === 0.12, c.lot);
  check('the unit table becomes the unit mix: 2 x 2BR (900 SF, $1,900 current, $2,250 pro forma) and 4 x 2.5BR ($1,456 current with one vacant, $2,250 pro forma)', c.mix.length === 2 && c.mix[0].type === '2BR' && c.mix[0].units === 2 && c.mix[0].cur === 1900 && c.mix[0].pf === 2250 && c.mix[0].sf === 900 && c.mix[1].type === '2.5BR' && c.mix[1].units === 4 && c.mix[1].cur === 1456 && c.mix[1].vacant === 1 && c.avgCur === 1604 && c.avgPf === 2250, JSON.stringify(c.mix));
  check('the statement is read in both columns: gross $115,500 / $162,000, vacancy $0 / $8,100 (5%), EGI $115,500 / $153,900, total expenses $34,775 / $36,695, NOI $80,725 / $117,205', c.periods.join() === 'cur,pf' && c.gsr.cur === 115500 && c.gsr.pf === 162000 && c.vac.cur === 0 && c.vac.pf === 8100 && c.vac.pfPct === 0.05 && c.egi.cur === 115500 && c.egi.pf === 153900 && c.expTot.cur === 34775 && c.expTot.pf === 36695 && c.noi.cur === 80725 && c.noi.pf === 117205, JSON.stringify([c.gsr, c.vac, c.egi, c.expTot, c.noi]));
  check('seven expense lines, each with its current and pro forma figure (Fuel is $0 in both; Insurance $6,000 / $8,500)', c.exp.length === 7 && c.exp.map(e => e.label).join('|') === 'Real Estate Taxes|Fuel|Water & Sewer|Insurance|Common Area Electric|Repairs & Maintenance|Management' && c.exp[1].cur === 0 && c.exp[3].cur === 6000 && c.exp[3].pf === 8500, JSON.stringify(c.exp));
  const okIds = p2 => (c.recon[p2] || []).filter(x => x.ok).map(x => x.id).join(), badIds = p2 => (c.recon[p2] || []).filter(x => !x.ok).map(x => x.id + ':' + x.a + '/' + x.b).join();
  check('the current column adds up everywhere: unit rents to the monthly total, x 12 to gross income, less vacancy to EGI, lines to total expenses, EGI less expenses to NOI', okIds('cur') === 'units,gsr,egi,exp,noi' && badIds('cur') === '', JSON.stringify(c.recon.cur));
  check('the OM\'s own pro forma does not add up: its expense lines are $39,195 against a printed total of $36,695; that is reported and the printed figures are kept', badIds('pf') === 'exp:39195/36695' && okIds('pf') === 'units,gsr,egi,noi', JSON.stringify(c.recon.pf));
  check('current basis: the deal\'s NOI recomputes to the OM\'s $80,725 within $5, nothing is left to ask, and nothing is Low or unverified', c.tie != null && Math.abs(c.tie - 80725) <= 5 && c.needs.length === 0 && c.sum.low === 0 && c.sum.check === 0, JSON.stringify([c.tie, c.needs, c.sum]));
  check('the deal carries the OM\'s figures: $1,175,000, 6 units, 5,676 SF, rent $1,604.17 a unit, 0% vacancy as printed, taxes $13,500, insurance $6,000, utilities $3,500, R&M $6,000, management 5%', c.deal.purchasePrice === 1175000 && c.deal.units === 6 && c.deal.gsf === 5676 && c.deal.avgRent === 1604.17 && c.deal.vacancy === 0 && c.deal.taxes === 13500 && c.deal.insurance === 6000 && c.deal.utilities === 3500 && c.deal.rm === 6000 && c.deal.mgmtPct === 0.05 && c.deal.location === 'Bridgeport, CT', JSON.stringify(c.deal).slice(0, 300));
  check('the price is verified against both printed cap rates (NOI / price = 6.87% and 9.97%)', c.fields.purchasePrice.l === 'verified' && /6\.87%/.test(c.fields.purchasePrice.why) && /9\.97%/.test(c.fields.purchasePrice.why), JSON.stringify(c.fields.purchasePrice));
  check('the vacant unit is named in the notes: unit 6 is $0 current and $2,250 pro forma', c.notes.some(n => /Unit 6 is vacant/.test(n) && /\$2,250/.test(n)), c.notes.filter(n => /vacant/i.test(n)).join(' | '));
  const f = await run('pf');
  check('pro forma basis: the deal uses the expense lines as printed, so its NOI ($114,705) is $2,500 below the OM\'s $117,205, exactly the OM\'s own error', f.tie != null && Math.abs(f.tie - 114705) <= 5 && f.want === 117205, JSON.stringify([f.tie, f.want]));
  check('pro forma basis: the fields say the OM does not add up (Check), not that a line was misread (Low)', f.sum.low === 0 && f.fields.taxes.l === 'check' && /do not add up/.test(f.fields.taxes.why) && /\$39,195/.test(f.fields.taxes.why) && /\$36,695/.test(f.fields.taxes.why), JSON.stringify([f.sum, f.fields.taxes]));
  check('pro forma basis: a note tells the user the column does not add up and to ask the broker', f.notes.some(n => /Pro Forma column does not add up/.test(n) && /\$2,500/.test(n) && /ask the broker/.test(n)), f.notes.filter(n => /add up/.test(n)).join(' | '));
  check('no page errors', errs.length === 0, errs.join(' | '));
  console.log('om gregory: ' + checks + ' checks, ' + fails + ' failures'); await b.close(); process.exit(fails ? 1 : 0);
})();
