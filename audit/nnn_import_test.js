// NNN terms from a rent roll: when the rent roll carries a recovery structure (NNN, Gross, Base Year, Expense Stop, Fixed), a base year, an expense stop or a pro rata share,
// the import keeps them and the commercial lease built from the row uses them, so the recoveries follow the lease and not a guess. A rent roll without those
// columns imports exactly as before.
//   node audit/nnn_import_test.js index.html [reference.html]
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); const path = require('path');
const A = Object.assign({}, require(path.join(__dirname, 'deal.js')), { purchasePrice: 19800000 });
const CSV = `RENT ROLL - TEST CENTER
,
Suite,Unit Type,Sq Ft,Tenant,Status,Lease Rent,Market Rent,Lease From,Lease To,Recovery Type,Base Year,Expense Stop,Pro Rata Share,Recoveries
S-101,Retail,"2,000",Cafe LLC,Occupied,"8,000","8,500",1/1/2025,12/31/2032,NNN,,,12.5%,
S-102,Retail,"1,500",Salon Inc,Occupied,"5,000","5,200",1/1/2024,12/31/2030,Gross,,,,
S-103,Retail,"1,800",Dental PC,Occupied,"7,200","7,500",1/1/2023,12/31/2031,Base Year,2023,,10%,
S-104,Office,"1,000",Law LLP,Occupied,"3,000","3,100",1/1/2025,12/31/2029,Expense Stop,,8.50,,
S-105,Retail,900,Deli Co,Occupied,"3,500","3,600",1/1/2025,12/31/2029,,,,,450
S-106,Retail,"1,200",,Vacant,0,"4,000",,,,,,,
`;
const LEGACY = `RENT ROLL - TEST CENTER
,
Suite,Unit Type,Sq Ft,Tenant,Status,Lease Rent,Market Rent,Lease From,Lease To,Recoveries
S-101,Retail,"2,000",Cafe LLC,Occupied,"8,000","8,500",1/1/2025,12/31/2032,500
S-102,Retail,"1,500",Salon Inc,Occupied,"5,000","5,200",1/1/2024,12/31/2030,
S-103,Retail,900,Deli Co,Occupied,"3,500","3,600",1/1/2025,12/31/2029,450
S-104,Retail,"1,200",,Vacant,0,"4,000",,,
`;
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  let checks = 0, fails = 0; const check = (n, ok, d) => { checks++; if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? '  [' + String(d).slice(0, 300) + ']' : '')); };
  const mk = async (file) => { const p = await b.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message)); await p.route(/supabase\.co|vercel\.app|fonts\.g|cdn\.jsdelivr/, r => r.abort()); await p.goto('file://' + path.resolve(file)); await p.waitForTimeout(700); await p.evaluate(() => document.documentElement.classList.add('bk-auth-ok')); await p.evaluate((a) => { bkCreateNewDeal(a); showSheet('Import Rent Roll'); }, A); await p.waitForTimeout(300); return p; };
  const load = (p, csv) => p.evaluate(async (csv) => { const inp = document.getElementById('bkRRFile'), dt = new DataTransfer(); dt.items.add(new File([csv], 'rr.csv', { type: 'text/csv' })); inp.files = dt.files; await bkRRRun(inp); bkRRApply('replace', false); const s = bkLoad(); s.commLeaseModel = true; s.leases = bkLeaseFromRentRoll(s); bkSave(s); const s2 = bkLoad(); return { rr: s2.rentRoll.map(u => ({ id: u.unitId, t: u.recType, by: u.baseYear, st: u.recStop, sh: u.recShare, rc: u.recovery })), L: s2.leases.map(l => ({ n: l.tenant, t: l.recType, by: l.baseYear, st: l.recStop, f: l.recFixed, sh: l.recShares ? l.recShares.taxes : null, nsh: l.recShares ? Object.keys(l.recShares).length : 0 })) }; }, csv);
  const rec = (p) => p.evaluate(() => { const ev = bkLeaseEval(bkLoad(), 24, { tax: y => Math.pow(1.02, y - 1), opex: m => Math.pow(1.03, m / 12) }, true); return Object.keys(ev.byT).map(k => ev.byT[k].rec.slice(0, 12)); });
  const p = await mk(process.argv[2]);
  const R = await load(p, CSV), rr = R.rr, L = R.L;
  check('the import recognises the recovery structure, base year, expense stop and pro rata share columns (and keeps the recoveries amount column as its own)', rr[0].t === 'NNN' && rr[1].t === 'Gross' && rr[2].t === 'BaseYear' && rr[2].by === 2023 && rr[3].t === 'Stop' && rr[3].st === 8.5 && Math.abs(rr[0].sh - 0.125) < 1e-12 && Math.abs(rr[2].sh - 0.10) < 1e-12 && rr[4].rc === 450 && rr[4].t == null, JSON.stringify(rr));
  check('each commercial lease built from the rent roll keeps its structure: NNN, Gross, Base Year (2023), Expense Stop ($8.50 / SF)', L[0].t === 'NNN' && L[1].t === 'Gross' && L[2].t === 'BaseYear' && L[2].by === 2023 && L[3].t === 'Stop' && L[3].st === 8.5, JSON.stringify(L.slice(0, 4)));
  check('a stated pro rata share becomes the tenant\'s share of every recoverable expense line (12.5% and 10%); a row without one keeps the area share', L[0].sh === 0.125 && L[0].nsh >= 5 && L[2].sh === 0.1 && L[1].nsh === 0 && L[3].nsh === 0, JSON.stringify(L.map(l => [l.n, l.sh, l.nsh])));
  check('a row with only a recoveries amount keeps the earlier mapping (a fixed recovery of $450 a month is $6.00 / SF a year); a vacant suite is NNN on re-lease', L[4].t === 'Fixed' && Math.abs(L[4].f - 6) < 1e-9 && L[5].t === 'NNN', JSON.stringify([L[4], L[5]]));
  const r1 = await rec(p), sum = a => a.reduce((x, y) => x + y, 0);
  check('the recoveries follow the lease: the Gross tenant recovers nothing, the NNN tenant recovers a share of the expense pool, the fixed tenant about $450 a month (it escalates with expense inflation)', sum(r1[1]) === 0 && sum(r1[0]) > 0 && Math.abs(r1[4][0] - 450) / 450 < 0.01 && sum(r1[0]) > sum(r1[4]), 'NNN yr1 ' + Math.round(sum(r1[0])) + ', gross ' + sum(r1[1]));
  const lin = await p.evaluate(async () => { const s = bkLoad(), a = bkLeaseEval(s, 24, { tax: y => Math.pow(1.02, y - 1), opex: m => Math.pow(1.03, m / 12) }, true).byT[0].rec.slice(0, 12).reduce((x, y) => x + y, 0);
    const s2 = JSON.parse(JSON.stringify(s)); Object.keys(s2.leases[0].recShares).forEach(k => { s2.leases[0].recShares[k] = 0.25; }); const b2 = bkLeaseEval(s2, 24, { tax: y => Math.pow(1.02, y - 1), opex: m => Math.pow(1.03, m / 12) }, true).byT[0].rec.slice(0, 12).reduce((x, y) => x + y, 0);
    const s3 = JSON.parse(JSON.stringify(s)); delete s3.leases[0].recShares; const c3 = bkLeaseEval(s3, 24, { tax: y => Math.pow(1.02, y - 1), opex: m => Math.pow(1.03, m / 12) }, true).byT[0].rec.slice(0, 12).reduce((x, y) => x + y, 0); const bsf = Math.max(Number(s.gsf) || 0, s.leases.reduce((t, l) => t + Number(l.sf || 0), 0));
    return { a, b2, c3, want: (2000 / bsf) / 0.125 }; });
  check('the stated share drives the recovery: doubling it to 25% doubles the NNN tenant\'s recoveries; removing it falls back to the area share (2,000 SF over the building)', Math.abs(lin.b2 / lin.a - 2) < 1e-9 && Math.abs(lin.c3 / lin.a - lin.want) < 1e-6, JSON.stringify(lin));
  /* a rent roll without the new columns imports exactly as before */
  const q = await mk(process.argv[2]), ql = await load(q, LEGACY);
  check('a rent roll with no recovery-structure columns imports as before (fixed $ recoveries or gross; nothing new is set)', ql.rr.every(u => u.t == null && u.by == null && u.st == null && u.sh == null) && ql.L[0].t === 'Fixed' && ql.L[1].t === 'Gross' && ql.L[2].t === 'Fixed' && ql.L[3].t === 'NNN', JSON.stringify(ql.L));
  if (process.argv[3]) { const o = await mk(process.argv[3]), ol = await load(o, LEGACY); check('...identical to the reference build', JSON.stringify(ol.L) === JSON.stringify(ql.L), JSON.stringify(ol.L)); await o.close(); }
  check('no page errors', p.errs.length === 0 && q.errs.length === 0, p.errs.concat(q.errs).slice(0, 2).join(' | '));
  await b.close(); console.log(checks + ' checks, ' + fails + ' failures'); process.exit(fails ? 1 : 0);
})();
