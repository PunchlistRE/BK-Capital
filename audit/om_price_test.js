// Import OM: price and printed cap rate extraction. Only an unambiguous ASKING price becomes the deal's price; a sold price, an
// assessed value or a loan figure never does; two different asking prices leave the price unset; a missing price is stated as
// missing, never zero; and the broker's printed cap rate only ever checks the price, it does not replace the calculated one.
// Page text in audit/fixtures/om_price_pages and om_ie_pages comes from five real OMs, as the importer's reader returns it.
//   node audit/om_price_test.js index.html [reference.html]
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); const path = require('path'), fs = require('fs');
const PX = n => fs.readFileSync(path.join(__dirname, 'fixtures', 'om_price_pages', n), 'utf8'), IE = n => fs.readFileSync(path.join(__dirname, 'fixtures', 'om_ie_pages', n), 'utf8');
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const p = await b.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route(/supabase\.co|vercel\.app|fonts\.g|cdn\.jsdelivr/, r => r.abort());
  await p.goto('file://' + path.resolve(process.argv[2])); await p.waitForTimeout(700);
  await p.evaluate(() => document.documentElement.classList.add('bk-auth-ok'));
  let checks = 0, fails = 0; const check = (n, ok, d) => { checks++; if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? '  [' + d + ']' : '')); };
  const run = (pages, opts) => p.evaluate(([pages, opts]) => { bkCreateNewDeal({ name: 'x', dealId: 'X' }); const o = bkOMParse(pages), S = bkOMState();
    S.om = o; S.basis = 'cur'; S.mPrice = null; S.mPriceFrom = null; S.dec = {}; S.mCommSF = null; if (opts && opts.pick != null) bkOMPricePick(opts.pick); if (opts && opts.units) o.units = opts.units;
    const out = { price: o.price, method: o.priceMethod || null, typo: o.priceTypo || null, fallback: !!o.priceFallback, conflict: o.priceConflict, srcPage: o.sources && o.sources.price, caps: o.capRates || null, ie: !!o.ie,
      cands: (o.priceCandidates || []).map(c => ({ kind: c.kind, value: c.value, page: c.page, method: c.method, label: c.label })) };
    if (o.ie && o.ie.noi && o.ie.exp.length) { const bd = bkOMBuild(o, 'cur', 'x.pdf'), conf = bkOMConf(o, bd, null, 'cur'); out.conf = conf.fields.purchasePrice; out.exitCap = bd.deal.exitCap; out.notes = bd.notes; out.priceOnDeal = bd.deal.purchasePrice; out.ready = !!(o.price || S.mPrice); }
    return out; }, [pages, opts || null]);
  const kinds = r => r.cands.map(c => c.kind + ':' + c.value).join(',');

  /* 1. the real OMs */
  const sea = await run([PX('seabreeze_p3.txt'), PX('seabreeze_p8.txt'), IE('seabreeze_p19.txt')], { units: 60 });
  check('Seabreeze: the price is under a spaced-letter heading ("P R I C E  C A P R A T E"), the figures on the next line: $9,000,000', sea.price === 9000000 && sea.method === 'column heading and its figure' && sea.srcPage === 1, JSON.stringify([sea.price, sea.method, sea.srcPage]));
  check('Seabreeze: "median sale price" in the market prose is not a price candidate', kinds(sea) === 'asking:9000000', kinds(sea));
  check('Seabreeze: the printed cap rates are read: 6.00% in-place and 8.79% pro forma, kept apart', sea.caps && Math.abs(sea.caps.cur - 0.06) < 1e-9 && Math.abs(sea.caps.pf - 0.0879) < 1e-9, JSON.stringify(sea.caps));
  check('Seabreeze: the price is verified against both printed rates (NOI ÷ price = 6.00% and 8.79%)', sea.conf && sea.conf.l === 'verified' && /6\.00%/.test(sea.conf.why) && /8\.79%/.test(sea.conf.why), sea.conf && sea.conf.why);
  const spr = await run([IE('spring_street_p3.txt'), IE('spring_street_p21.txt')], { units: 12 });
  check('Spring Street: "Price:   $4,500,000" in the middle of a line is an asking price', spr.price === 4500000 && spr.cands.length === 1 && spr.cands[0].kind === 'asking', kinds(spr));
  check('Spring Street: the printed 5.74% cap rate checks the price (258,516 ÷ 4,500,000 = 5.745%) and is not used in its place', spr.caps.cur === 0.0574 && spr.conf.l === 'verified' && Math.abs(spr.exitCap - 258516 / 4500000) < 0.00006, `${spr.conf.l} / exit cap ${spr.exitCap}`);
  const em = await run([PX('east_main_p3.txt'), PX('east_main_p4.txt')]);
  check('439 East Main: "Price $1,480,000" is read, and "purchase price at 5% interest only" (financing prose) is not a candidate', em.price === 1480000 && em.cands.length === 1, kinds(em));
  const sel = await run([PX('selleck_p2.txt'), PX('selleck_p3.txt')]);
  check('Selleck: the $4,500,000 is a SOLD price (sale record, comp status), never the asking price: price stays unset', sel.price === null && sel.cands.some(c => c.kind === 'sold' && c.value === 4500000) && !sel.cands.some(c => c.kind === 'asking'), kinds(sel));
  check('Selleck: the assessed total value ($5,721,390) is listed as an assessment, not a price', sel.cands.some(c => c.kind === 'assessed' && c.value === 5721390), kinds(sel));
  const fife = await run([PX('fife_p3.txt'), PX('fife_p6.txt'), IE('fife_n_drum_p28.txt'), PX('fife_p29.txt')], { units: 10 });
  check('Fife N Drum: the OM states no price, and none is found or invented', fife.price === null && fife.cands.length === 0, kinds(fife));
  check('Fife N Drum: the missing price is flagged Low ("states no price"), not defaulted, and the deal cannot be created from it', fife.conf.l === 'low' && /states no price/.test(fife.conf.why) && fife.ready === false, fife.conf && fife.conf.why);

  /* 2. the user may choose one of the OM's own figures, and it is recorded for what it is */
  const pick = await run([PX('selleck_p2.txt'), PX('selleck_p3.txt'), IE('seabreeze_p19.txt')], { pick: 0, units: 60 });
  check('choosing the sold price as the price is allowed, is a "check", and says what it is (not what the seller is asking)', pick.ready === true && pick.priceOnDeal === 4500000 && pick.conf.l === 'check' && /a sold price/.test(pick.conf.why) && /not what the seller is asking/.test(pick.conf.why), pick.conf && pick.conf.why);

  /* 3. synthetic cases: conflicts, kinds, prose, per-SF, typos */
  const ST = body => ['FOR SALE - Birch Row - 9 Birch Street, Albany, NY\n' + body, 'OPERATING INCOME\nGross Potential Rent $200,000 $210,000\nEffective Gross Income $190,000 $199,500\nOPERATING EXPENSES\nReal Estate Taxes $30,000 $3,000 $31,000 $3,100\nTotal Expenses $30,000 $3,000 $31,000 $3,100\nNet Operating Income $160,000 $168,500'];
  const two = await run(ST('Asking Price $2,000,000\nPurchase Price $2,250,000\nTotal 12 Units 9,000 SF'));
  check('two different asking prices leave the price unset and list both for the user to choose', two.price === null && JSON.stringify(two.conflict) === '[2000000,2250000]', JSON.stringify(two.conflict));
  check('the conflict is flagged Low, naming both prices', two.conf.l === 'low' && /more than one asking price/.test(two.conf.why) && /2,000,000/.test(two.conf.why) && /2,250,000/.test(two.conf.why));
  const same = await run(ST('Asking Price $2,000,000\nOffering Price $2,000,000\nTotal 12 Units 9,000 SF'));
  check('the same price stated twice is one asking price', same.price === 2000000 && same.conflict === null);
  const mix = await run(ST('Asking Price $5,000,000\nPrior Sale Price $3,000,000 (sold 2019)\nAssessed Value $4,200,000\nTotal 12 Units 9,000 SF'));
  check('an asking price beside a prior sale and an assessment: the asking price is taken, the others only listed', mix.price === 5000000 && /sold:3000000/.test(kinds(mix)) && /assessed:4200000/.test(kinds(mix)), kinds(mix));
  const noise = await run(ST('Price per unit $75,000\nPrice/SF $400\nTotal 12 Units 9,000 SF'));
  check('"price per unit" and "price/SF" are not prices', noise.price === null && noise.cands.length === 0, kinds(noise));
  const typo = await run(ST('ASKING PRICE FOR BOTH PROPERTIES:\n$12.999,000\nTotal 12 Units 9,000 SF'));
  check('"$12.999,000" (a typed period) is read as $12,999,000 and flagged', typo.price === 12999000 && typo.typo === '$12.999,000' && typo.conf.l === 'check', JSON.stringify([typo.price, typo.typo]));
  const next = await run(ST('Price to Sell:\n$6,250,000\nTotal 12 Units 9,000 SF'));
  check('a price on the line after its label is an asking price, found "near the label" and flagged for confirmation', next.price === 6250000 && next.fallback === true && next.method === 'figure on the line after its label', JSON.stringify([next.price, next.method]));

  /* 4. the broker's printed cap rate checks the price; it never replaces the calculated one */
  const cap = await run(ST('Asking Price $2,000,000\nCap Rate: 7.00%\nTotal 12 Units 9,000 SF'));
  check('a printed 7.00% cap rate that disagrees with 160,000 ÷ 2,000,000 = 8.00% flags the price Low and names both', cap.conf.l === 'low' && /8\.00%/.test(cap.conf.why) && /7\.00%/.test(cap.conf.why), cap.conf && cap.conf.why);
  check('the exit cap starts at the CALCULATED 8.00%, not the broker\'s 7.00%, and the notes say so', Math.abs(cap.exitCap - 0.08) < 1e-9 && cap.notes.some(n => /prints a 7\.00% cap rate/.test(n) && /uses the calculated rate/.test(n)), `${cap.exitCap}`);
  const ok = await run(ST('Asking Price $2,000,000\nCap Rate: 8.00%\nTotal 12 Units 9,000 SF'));
  check('a printed cap rate that agrees verifies the price, and the exit cap is still the calculated one', ok.conf.l === 'verified' && Math.abs(ok.exitCap - 0.08) < 1e-9);
  const none = await run(ST('Asking Price $2,000,000\nTotal 12 Units 9,000 SF'));
  check('with no printed cap rate the price is a "check": nothing corroborates it', none.conf.l === 'check' && /nothing in the OM corroborates/.test(none.conf.why));

  /* 5. existing layouts read as before */
  if (process.argv[3]) {
    const ref = await b.newPage(); await ref.route(/supabase\.co|vercel\.app|fonts\.g|cdn\.jsdelivr/, r => r.abort()); await ref.goto('file://' + path.resolve(process.argv[3])); await ref.waitForTimeout(700);
    const f = new Function('pages', 'const o = bkOMParse(pages); return { price: o.price, page: o.sources && o.sources.price, fallback: !!o.priceFallback, typo: o.priceTypo || null, curCap: o.curCap || null, noi: o.ie && o.ie.noi };');
    for (const [nm, pages] of [['Birch Row (labelled price)', ST('Asking Price $2,000,000\nTotal 12 Units 9,000 SF')], ['Price to Sell on the next line', ST('Price to Sell:\n$6,250,000\nTotal 12 Units 9,000 SF')], ['"$12.999,000"', ST('ASKING PRICE FOR BOTH PROPERTIES:\n$12.999,000\nTotal 12 Units 9,000 SF')], ['Offering Price with a printed two-column cap rate', ST('Offering Price $3,000,000\nCap Rate 5.00% 6.00%\nTotal 20 Units 18,000 SF')]]) {
      const a = await p.evaluate(f, pages), r0 = await ref.evaluate(f, pages);
      check('same price reading as the build from before this change (or newly found where it found none): ' + nm, (r0.price == null ? a.price != null : (a.price === r0.price && a.page === r0.page && a.typo === r0.typo)) && (r0.price == null || a.curCap === r0.curCap), JSON.stringify([a.price, r0.price, a.curCap, r0.curCap]));
    }
  }
  check('no page errors', errs.length === 0, errs.join(' | '));
  await b.close(); console.log(`${checks} checks, ${fails} failures`); process.exit(fails ? 1 : 0);
})();
