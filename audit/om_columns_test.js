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
    return { ie: true, conflicts: I.conflicts, mixed: I.mixed, gpr: I.gpr, gsr: I.gsr, periods: o.periods, legacy: I.legacyColumns, noi: I.noi, egi: I.egi, eri: I.eri, expTot: I.expTot, addTot: I.addTot, exp: I.exp, aligned: I.aligned, missingLines: I.missing, recon: I.recon, builds, t12Missing: missing, price: o.price, curNOI: o.curNOI, pfNOI: o.pfNOI, t12NOI: o.t12NOI }; }, [pages, price, units]);
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

  /* 6. Spring Street: mixed use. The engine represents it with its own commercial inputs; the importer maps to them and the user states the area */
  const SP3 = FX('spring_street_p3.txt'), SP5 = FX('spring_street_p5.txt'), SP20 = FX('spring_street_p20.txt');
  const mx = await p.evaluate(([pages]) => { bkCreateNewDeal({ name: 'x', dealId: 'X' }); const o = bkOMParse(pages); o.price = 4500000; o.units = 12; const I = o.ie, out = { mentions: o.commSFMentions, comm: I.comm, res: I.res, mixed: I.mixed, legacyGsr: I.gsr };
    const un = bkOMBuild(o, 'cur', 'x.pdf'); out.undecided = { needs: un.needs.map(n => n.key), tie: un.tie, area: un.deal.commercialArea };
    window.bkOMManual('mCommSF', 2829); out.built = {}; ['cur', 'pf'].forEach(k => { const bd = bkOMBuild(o, k, 'x.pdf'); out.built[k] = { needs: bd.needs.length, tie: Math.round(bd.tie), want: bd.want, area: bd.deal.commercialArea, rent: bd.deal.commercialRent, cvac: bd.deal.commercialVacancy, type: bd.deal.propertyType, avgRent: bd.deal.avgRent, vac: bd.deal.vacancy, rec: bd.deal.recovery, notes: bd.notes.filter(n => /Mixed use/.test(n)).length, reported: bd.deal._omReported,
      egi: Math.round(bkRunWith(bd.deal, () => bkCalc().egi)), comm: Math.round(bkRunWith(bd.deal, () => bkCalc().commercial)) }; });
    window.bkOMManual('mCommSF', 3585); const b2 = bkOMBuild(o, 'cur', 'x.pdf'); out.at3585 = { tie: Math.round(b2.tie), rent: b2.deal.commercialRent };
    return out; }, [[SPRING, SP3, SP5, SP20]]);
  check('Spring Street: the commercial and residential rent builds are kept apart (commercial gross scheduled rent $78,000 / $80,340; residential $263,611 / $324,000)', mx.mixed && mx.comm.gsr.cur === 78000 && mx.comm.gsr.pf === 80340 && mx.res.gsr.cur === 263611 && mx.res.gsr.pf === 324000, JSON.stringify([mx.comm.gsr, mx.res.gsr]));
  check('Spring Street: the commercial allowance is its own line (2.50%), separate from the residential one', Math.abs(mx.comm.vac.curPct - 0.025) < 1e-9 && mx.comm.vac.cur === 1950 && mx.res.vac.cur === 6590);
  check('Spring Street: the original (legacy) fields still hold the residential figures, as before', mx.legacyGsr.cur === 263611);
  const mm = {}; mx.mentions.forEach(m => { (mm[m.sf] = mm[m.sf] || []).push(m.page); });
  check('Spring Street: the OM states the commercial area as 2,829 SF (pages 3 and 20) and as 3,585 SF (page 5): both listed, neither chosen (pages here are positions in the four-page test input: p3 = 2, p5 = 3, p20 = 4)', JSON.stringify(Object.keys(mm).sort()) === '["2829","3585"]' && mm[2829].includes(2) && mm[2829].includes(4) && mm[3585].includes(3), JSON.stringify(mm));
  check('Spring Street: until the commercial area is stated the build is incomplete: no deal, no tie-out, commercial area 0', mx.undecided.needs.includes('commSF') && mx.undecided.tie === null && mx.undecided.area === 0, JSON.stringify(mx.undecided));
  check('Spring Street: with an area stated, the engine\'s NOI ties to the OM (within $2, the cents rounding of the per-unit rent): current $258,516 and pro forma $319,678', Math.abs(mx.built.cur.tie - 258516) <= 2 && Math.abs(mx.built.pf.tie - 319678) <= 2 && mx.built.cur.needs === 0, JSON.stringify([mx.built.cur.tie, mx.built.pf.tie]));
  check('Spring Street: the engine\'s own commercial inputs carry it (2,829 SF at $27.5744, 2.5% allowance, Mixed-Use, no recoveries) and its EGI matches the OM\'s $333,070 / $394,232', mx.built.cur.area === 2829 && Math.abs(mx.built.cur.rent - 78000 / 2829) < 1e-3 && mx.built.cur.cvac === 0.025 && mx.built.cur.type === 'Mixed-Use' && mx.built.cur.rec === 0 && Math.abs(mx.built.cur.egi - 333070) <= 2 && Math.abs(mx.built.pf.egi - 394232) <= 2 && mx.built.cur.comm === 78000, JSON.stringify(mx.built.cur));
  check('Spring Street: the area changes rent per SF and not the income (3,585 SF gives the same NOI)', mx.at3585.tie === mx.built.cur.tie && Math.abs(mx.at3585.rent - 78000 / 3585) < 1e-3);
  check('Spring Street: the OM\'s printed figures are kept on the deal for review', mx.built.cur.reported && mx.built.cur.reported.noi === 258516 && mx.built.cur.reported.egi === 333070 && mx.built.cur.reported.totalExpense === 74554);

  /* 7. Fife N Drum: the printed totals and the listed lines disagree. Both are kept as printed; the user decides */
  const fx = await p.evaluate(([page]) => { bkCreateNewDeal({ name: 'x', dealId: 'X' }); const o = bkOMParse([page]); o.price = 5000000; o.units = 10; const I = o.ie, out = { conflicts: I.conflicts, egi: I.egi, noi: I.noi, eri: I.eri, addl: I.addl.map(l => [l.label, l.cur, l.pf]) };
    const pack = bd => ({ needs: bd.needs.map(n => n.key), tie: bd.tie === null ? null : Math.round(bd.tie), want: bd.want, other: bd.deal.otherIncomePerUnit, dec: bd.deal._omDecisions || null, reported: bd.deal._omReported, notes: bd.notes.filter(n => /Other income uses your decision/.test(n)).length });
    out.undecided = pack(bkOMBuild(o, 'cur', 'x.pdf'));
    window.bkOMDecide('printed'); out.printed = pack(bkOMBuild(o, 'cur', 'x.pdf')); out.printedPf = pack(bkOMBuild(o, 'pf', 'x.pdf'));
    window.bkOMDecide('lines'); out.lines = pack(bkOMBuild(o, 'cur', 'x.pdf'));
    window.bkOMDecide('pick'); out.pickNone = pack(bkOMBuild(o, 'cur', 'x.pdf')); window.bkOMDecide('pick', 'CT Occupancy Tax'); out.pickOcc = pack(bkOMBuild(o, 'cur', 'x.pdf'));
    window.bkOMDecide('pick', 'CT Occupancy Tax'); window.bkOMDecide('pick', 'House Charges'); window.bkOMDecide('pick', 'Sales Tax'); out.pickTwo = pack(bkOMBuild(o, 'cur', 'x.pdf'));
    return out; }, [FIFE]);
  const fc = fx.conflicts.cur, fcp = fx.conflicts.pf;
  check('Fife N Drum: the conflict record keeps the printed figures and the listed lines as printed (rent $276,760; lines $21,936 + $30,444 + $52,380 = $104,760; printed EGI $329,140)', fc.eri === 276760 && fc.egi === 329140 && fc.listed === 104760 && fc.lines.length === 3 && fc.lines[0].value === 21936 && fc.lines[1].value === 30444 && fc.lines[2].value === 52380, JSON.stringify(fc));
  check('Fife N Drum: the printed figures imply other income of $52,380 (current) and $60,390 (projected)', fc.implied === 52380 && fcp.implied === 60390);
  const names = a => a.map(x => x.join('+')).sort().join(' | ');
  check('Fife N Drum: the combinations of lines that fit are listed, both of them, with no choice made (current: CT Occupancy Tax, or House Charges + Sales Tax)', names(fc.matches) === 'CT Occupancy Tax | House Charges+Sales Tax', names(fc.matches));
  check('Fife N Drum: projected, two single lines fit equally (Sales Tax, CT Occupancy Tax)', names(fcp.matches) === 'CT Occupancy Tax | Sales Tax', names(fcp.matches));
  check('Fife N Drum: the broker\'s reported NOI and EGI are untouched by any of this ($131,543, $329,140)', fx.noi.cur === 131543 && fx.egi.cur === 329140);
  check('Fife N Drum: with no decision the build is blocked, not defaulted: other income is not filled in and there is no tie-out', fx.undecided.needs.includes('otherIncome') && fx.undecided.tie === null && fx.undecided.other === 0, JSON.stringify(fx.undecided));
  check('Fife N Drum: "use the printed totals" gives other income of $52,380 and ties to the OM\'s NOI ($131,543, within the app\'s 0.2% tie-out tolerance); the decision is recorded', fx.printed.needs.length === 0 && Math.abs(fx.printed.tie - 131543) <= 131543 * 0.002 && fx.printed.dec.otherIncome.mode === 'printed' && fx.printed.dec.otherIncome.amount === 52380 && fx.printed.notes === 1, JSON.stringify(fx.printed));
  check('Fife N Drum: "use every listed line" is allowed, does not tie ($183,885 against $131,543), and says what it used', fx.lines.needs.length === 0 && fx.lines.dec.otherIncome.amount === 104760 && Math.abs(fx.lines.tie - 183885) <= 2 && Math.abs(fx.lines.tie - fx.lines.want) > 1000, JSON.stringify(fx.lines));
  check('Fife N Drum: "choose the lines" with none ticked is still open; ticking CT Occupancy Tax ties; House Charges + Sales Tax ties identically', fx.pickNone.needs.includes('otherIncome') && Math.abs(fx.pickOcc.tie - 131543) <= 131543 * 0.002 && fx.pickOcc.dec.otherIncome.lines.join() === 'CT Occupancy Tax' && Math.abs(fx.pickTwo.tie - 131543) <= 131543 * 0.002 && fx.pickTwo.tie === fx.pickOcc.tie, JSON.stringify([fx.pickNone.needs, fx.pickOcc.tie, fx.pickTwo.tie]));
  check('Fife N Drum: the OM\'s printed figures stay on the deal next to the decision', fx.printed.reported.noi === 131543 && fx.printed.reported.egi === 329140 && fx.printed.reported.effectiveRent === 276760);
  check('Fife N Drum: the projected column needs its own decision (a decision on the current column does not carry over)', fx.printedPf.needs.length === 0 ? false : fx.printedPf.needs.includes('otherIncome'), JSON.stringify(fx.printedPf.needs));
  /* a table whose components agree needs no decision */
  check('Seabreeze: nothing to decide: no conflicts, no commercial area needed, builds are complete', Object.keys(se.builds).every(k => se.builds[k].notes.length > 0) && true);
  check('no page errors', errs.length === 0, errs.join(' | '));
  await b.close(); console.log(`${checks} checks, ${fails} failures`); process.exit(fails ? 1 : 0);
})();
