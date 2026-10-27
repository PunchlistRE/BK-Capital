// Import OM: letter-spaced income and expense headings, and period columns (Trailing 12 / Current / Pro Forma).
// The Income & Expense pages in audit/fixtures/om_ie_pages are the text of one page each from three real offering memoranda
// (45-47 Spring Street p21, Fife N Drum p28, Seabreeze Apartments p19), as the importer's PDF reader returns them.
// Every expected figure below was read off those pages by hand, not taken from the parser.
//   node audit/om_columns_test.js index.html
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); const path = require('path'), fs = require('fs');
const FX = n => fs.readFileSync(path.join(__dirname, 'fixtures', 'om_ie_pages', n), 'utf8');
const SPRING = FX('spring_street_p21.txt'), FIFE = FX('fife_n_drum_p28.txt'), SEA = FX('seabreeze_p19.txt');
// the classic layout (conventional headings, Current and Pro Forma columns): must read exactly as before
const CLASSIC = ['FOR SALE - Elm Court - 48 Elm Street, Springfield, MA\nOffering Price $3,000,000\nTotal 20 Units 18,000 SF',
  'OPERATING INCOME\nGross Potential Rent $360,000 $380,000\nVacancy (5.0%) ($18,000) 5.0% ($19,000) 5.0%\nEffective Gross Income $342,000 $361,000\nOPERATING EXPENSES\nReal Estate Taxes $40,000 $41,000\nInsurance $12,000 $12,000\nTotal Expenses $52,000 $53,000\nNet Operating Income $290,000 $308,000'];
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const p = await b.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route(/supabase\.co|vercel\.app|fonts\.g|cdn\.jsdelivr/, r => r.abort());
  await p.goto('file://' + path.resolve(process.argv[2])); await p.waitForTimeout(700);
  await p.evaluate(() => document.documentElement.classList.add('bk-auth-ok'));
  let checks = 0, fails = 0; const check = (n, ok, d) => { checks++; if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? '  [' + d + ']' : '')); };
  const parse = (pages, price, units) => p.evaluate(([pages, price, units]) => { bkCreateNewDeal({ name: 'x', dealId: 'X' }); const o = bkOMParse(pages); if (price) o.price = price; if (units) o.units = units; const I = o.ie; if (!I) return { ie: false };
    const builds = {}; (o.periods || []).forEach(k => { try { const bd = bkOMBuild(o, k, 'x.pdf'); builds[k] = { tie: bd.tie, want: bd.want, taxes: bd.deal.taxes, ins: bd.deal.insurance, mgmtPct: bd.deal.mgmtPct, vac: bd.deal.vacancy, avgRent: bd.deal.avgRent, other: bd.deal.otherIncomePerUnit, notes: bd.notes }; } catch (e) { builds[k] = { error: e.message }; } });
    let missing = null; try { bkOMBuild(o, 't12', 'x.pdf'); missing = 'built'; } catch (e) { missing = e.message; }
    return { ie: true, gpr: I.gpr, gsr: I.gsr, periods: o.periods, legacy: I.legacyColumns, noi: I.noi, egi: I.egi, eri: I.eri, expTot: I.expTot, addTot: I.addTot, exp: I.exp, aligned: I.aligned, missingLines: I.missing, recon: I.recon, builds, t12Missing: missing, price: o.price, curNOI: o.curNOI, pfNOI: o.pfNOI, t12NOI: o.t12NOI }; }, [pages, price, units]);
  const near = (a, b, t) => Math.abs(a - b) <= (t || 1);

  /* 1. letter-spaced headings: all three pages now parse, with the figures printed on them */
  const sp = await parse([SPRING], 4500000, 12), fi = await parse([FIFE], 5000000, 10), se = await parse([SEA], 9000000, 60);
  check('Spring Street: the table is found under "I N C O M E S U M M A R Y"', sp.ie && sp.noi.cur === 258516 && sp.noi.pf === 319678, JSON.stringify(sp.noi));
  check('Spring Street: 5 expense lines, total $74,554', sp.exp.length === 5 && sp.expTot.cur === 74554 && sp.expTot.pf === 74554);
  check('Fife N Drum: the table is found, NOI $131,543 current and $308,508 projected', fi.ie && fi.noi.cur === 131543 && fi.noi.pf === 308508);
  check('Fife N Drum: 16 expense lines, totals $197,596 and $300,882', fi.exp.length === 16 && fi.expTot.cur === 197596 && fi.expTot.pf === 300882, fi.exp.length);
  check('Seabreeze: the table is found, NOI $406,967 T-12, $540,304 current, $791,003 pro forma', se.ie && se.noi.t12 === 406967 && se.noi.cur === 540304 && se.noi.pf === 791003, JSON.stringify(se.noi));

  /* 2. normalisation does not touch other layouts */
  const cl = await parse(CLASSIC);
  /* the original reading of a two-figure expense row is amount + $/unit (so pro forma = current); that is kept, not "fixed" here */
  check('a conventional-heading, two-column statement reads as before', cl.ie && cl.legacy && cl.noi.cur === 290000 && cl.noi.pf === 308000 && cl.exp.length === 2 && cl.exp[0].label === 'Real Estate Taxes' && cl.exp[0].cur === 40000 && cl.exp[0].pf === 40000, JSON.stringify(cl.exp[0]));
  if (process.argv[3]) {   /* and identically to the build from before this change */
    const ref = await b.newPage(); await ref.route(/supabase\.co|vercel\.app|fonts\.g|cdn\.jsdelivr/, r => r.abort()); await ref.goto('file://' + path.resolve(process.argv[3])); await ref.waitForTimeout(700);
    const pick = pages => bkOMParse(pages) && (o => ({ price: o.price, units: o.units, sf: o.sf, curNOI: o.curNOI, pfNOI: o.pfNOI, ie: o.ie && { noi: o.ie.noi, egi: o.ie.egi, gpr: o.ie.gpr, vac: o.ie.vac, eri: o.ie.eri, expTot: o.ie.expTot, addTot: o.ie.addTot, exp: o.ie.exp, addl: o.ie.addl } }))(bkOMParse(pages));
    const both = async (pages) => { const f = new Function('pages', 'return (' + pick.toString() + ')(pages)'); const a = await p.evaluate(f, pages), r0 = await ref.evaluate(f, pages); return !!(a.ie && a.ie.noi && a.ie.exp.length) && JSON.stringify(a) === JSON.stringify(r0); };
    check('same parse as the build from before this change: the classic statement', await both(CLASSIC));
    check('same parse as the build from before this change: a statement with additional income and a rent-roll style table', await both(['FOR SALE - Birch Row - 9 Birch Street, Albany, NY\nAsking Price $2,000,000\nTotal 12 Units 9,000 SF', 'OPERATING INCOME\nGross Potential Rent $200,000 $210,000\nVacancy (5.0%) ($10,000) 5.0% ($10,500) 5.0%\nEffective Gross Income $190,000 $199,500\nADDITIONAL INCOME\nLaundry $4,000 $4,500\nParking $6,000 $6,000\nOPERATING EXPENSES\nReal Estate Taxes $30,000 $3,000 $31,000 $3,100\nInsurance $8,000 $800 $8,000 $800\nTotal Expenses $38,000 $3,800 $39,000 $3,900\nNet Operating Income $162,000 $170,500']));
  }
  const lab = await parse(['OPERATING INCOME\nGross Potential Rent $360,000 $380,000\nEffective Gross Income $342,000 $361,000\nOPERATING EXPENSES\nSuite A B C D E repairs $5,000 $5,000\nTotal Expenses $5,000 $5,000\nNet Operating Income $337,000 $356,000']);
  check('a spaced-letter label inside a row is left alone (only line-start headings are closed up)', lab.ie && lab.exp[0].label === 'Suite A B C D E repairs', lab.ie && lab.exp[0].label);
  const lone = await parse(['I N C O M E S U M M A R Y   Current   $/SF   %   Pro Forma   $/SF   %\nGross Potential Rent   $100,000   $110,000\nE X P E N S E S U M M A R Y\nReal Estate Tax   $10,000   $1.00   $10,000   $1.00\nTotal Expense   $10,000   $1.00   $10,000   $1.00\nNet Operating Income   $90,000   $100,000']);
  check('a two-column letter-spaced table (Current, Pro Forma) takes the original reading', lone.ie && lone.legacy && lone.noi.cur === 90000 && lone.noi.pf === 100000 && lone.exp[0].cur === 10000);

  /* 3. period columns, read independently */
  check('Seabreeze: three periods found, in the order printed', JSON.stringify(se.periods) === '["t12","cur","pf"]' && !se.legacy, JSON.stringify(se.periods));
  check('Seabreeze: Total Expense is $468,217 (T-12), $386,960 (current), $400,154 (pro forma): never swapped', se.expTot.t12 === 468217 && se.expTot.cur === 386960 && se.expTot.pf === 400154, JSON.stringify(se.expTot));
  check('Seabreeze: Effective Gross Income $875,184 / $927,263 / $1,191,157', se.egi.t12 === 875184 && se.egi.cur === 927263 && se.egi.pf === 1191157);
  check('Seabreeze: Effective Rental Income $825,843 / $886,936 / $1,150,830 (the row that prints all three)', se.eri.t12 === 825843 && se.eri.cur === 886936 && se.eri.pf === 1150830);
  check('Seabreeze: Total Additional Income $49,341 / $40,327 / $40,327 (not T-12 read as current)', se.addTot.t12 === 49341 && se.addTot.cur === 40327 && se.addTot.pf === 40327);
  const tx = se.exp.find(e => /real estate tax/i.test(e.label)), mg = se.exp.find(e => /property management/i.test(e.label)), pay = se.exp.find(e => /payroll/i.test(e.label));
  check('Seabreeze: real estate tax $115,591 / $144,738 / $144,738; management $51,849 / $46,363 / $59,558; payroll $71,030 / $25,000 / $25,000', tx.t12 === 115591 && tx.cur === 144738 && tx.pf === 144738 && mg.t12 === 51849 && mg.cur === 46363 && mg.pf === 59558 && pay.t12 === 71030 && pay.cur === 25000 && pay.pf === 25000);
  check('Seabreeze: rows that print fewer columns than the table (gross potential rent, below-market rent, gross scheduled rent, vacancy) are recorded as right-aligned', JSON.stringify(se.aligned) === '["Gross Potential Rent","Below Market Rent","Gross Scheduled Rent","Vacancy & Collection Loss"]', JSON.stringify(se.aligned));
  check('Seabreeze: gross potential rent $1,211,400 and gross scheduled rent $933,617 / $1,211,400 print two figures: they are current and pro forma, and no T-12 figure is invented', se.gpr.t12 === undefined && se.gpr.cur === 1211400 && se.gpr.pf === 1211400 && se.gsr.t12 === undefined && se.gsr.cur === 933617 && se.gsr.pf === 1211400, JSON.stringify([se.gpr, se.gsr]));
  check('Seabreeze: all 14 expense lines carry a value in every period', se.exp.length === 14 && se.missingLines.length === 0, se.exp.length);

  /* 4. reconciliation to the page */
  const allOk = r => Object.keys(r).every(k => r[k].every(c => c.ok));
  check('Seabreeze: every period\'s expense lines add to its printed Total Expense, EGI less expenses equals NOI, and rent plus other income equals EGI', allOk(se.recon) && Object.keys(se.recon).length === 3 && Object.values(se.recon).every(a => a.length === 3), JSON.stringify(Object.values(se.recon).map(a => a.map(c => c.ok))));
  check('Seabreeze: T-12 expenses add to $468,217 and current to within $1 of $386,960', near(se.recon.t12[0].a, 468217) && near(se.recon.cur[0].a, 386960, 1) && near(se.recon.pf[0].a, 400154));
  check('Spring Street: expenses add to the total and NOI = EGI less expenses, both columns', allOk(sp.recon) && Object.keys(sp.recon).length === 2);
  const fe = fi.recon.cur.find(c => c.id === 'egi'), fe2 = fi.recon.pf.find(c => c.id === 'egi');
  check('Fife N Drum: expenses and NOI tie, but "Effective rental income + other income" does NOT equal the printed EGI, and the page is flagged rather than adjusted', fi.recon.cur.find(c => c.id === 'exp').ok && fi.recon.cur.find(c => c.id === 'noi').ok && !fe.ok && !fe2.ok && fe.a === 381520 && fe.b === 329140, `${fe.a} vs ${fe.b}`);

  /* 5. the deal is built from the period you choose, and ties to that period's NOI */
  check('Seabreeze: built on T-12, current and pro forma, the engine\'s NOI ties to each period\'s printed NOI', ['t12', 'cur', 'pf'].every(k => near(se.builds[k].tie, se.builds[k].want, 2)), JSON.stringify(['t12', 'cur', 'pf'].map(k => [Math.round(se.builds[k].tie), se.builds[k].want])));
  check('Seabreeze: the T-12 deal carries T-12 taxes ($115,591) and the current/pro forma deals $144,738: periods are not mixed', se.builds.t12.taxes === 115591 && se.builds.cur.taxes === 144738 && se.builds.pf.taxes === 144738);
  check('Seabreeze: the pro forma deal does not use current expenses (management fee 5.00% of income vs T-12 5.92%)', Math.abs(se.builds.t12.mgmtPct - 0.0592) < 0.0006 && Math.abs(se.builds.pf.mgmtPct - 0.05) < 0.0006, `${se.builds.t12.mgmtPct} / ${se.builds.pf.mgmtPct}`);
  check('Seabreeze: the T-12 deal uses the effective rental income with 0% vacancy, and says so', se.builds.t12.vac === 0 && se.builds.t12.notes.some(n => /Trailing 12 column prints Effective Rental Income/.test(n)));
  check('Seabreeze: the notes name the three period columns and the one being underwritten', se.builds.cur.notes.some(n => /3 period columns \(Trailing 12, Current, Pro Forma\).*underwritten on the Current column/.test(n)));
  check('a period the table does not have is an error, not a substitute (Spring Street has no T-12 column)', /no t12 column/i.test(sp.t12Missing), sp.t12Missing);
  check('Spring Street: the deal is built on its own period, and its import notes say nothing about extra columns', sp.builds.cur.taxes === 47970 && !sp.builds.cur.notes.some(n => /period columns/.test(n)));

  /* 6. what these two builds do not do (documented limits, so they are not mistaken for ties) */
  check('Spring Street: the engine NOT tying to the OM is reported, because the commercial rent ($76,050) is not in the residential build', !near(sp.builds.cur.tie, sp.builds.cur.want, 100) && near(sp.builds.cur.want - sp.builds.cur.tie, 76050, 100), `${Math.round(sp.builds.cur.tie)} vs ${sp.builds.cur.want}`);
  check('Fife N Drum: the engine NOT tying to the OM is reported, by the listed other income that double counts ($52,380)', !near(fi.builds.cur.tie, fi.builds.cur.want, 100) && near(fi.builds.cur.tie - fi.builds.cur.want, 52380, 100), `${Math.round(fi.builds.cur.tie)} vs ${fi.builds.cur.want}`);
  check('no page errors', errs.length === 0, errs.join(' | '));
  await b.close(); console.log(`${checks} checks, ${fails} failures`); process.exit(fails ? 1 : 0);
})();
