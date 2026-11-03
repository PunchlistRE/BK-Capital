// Required and Status agree. The REQUIRED marker on a row, the Status chip beside it, the "Required inputs: n of m" bar and the Home count all read the same requirements
// (src/081 bkRequiredRows / bkFieldStatus). Blank each requirement in turn, on an acquisition and on a development, and check every one of them says the same thing.
//   node audit/required_status_test.js index.html
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); const path = require('path');
const A = require(path.join(__dirname, 'deal.js')), D = require(path.join(__dirname, 'devdeal.js'));
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  let checks = 0, fails = 0; const check = (n, ok, d) => { checks++; if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? '  [' + String(d).slice(0, 300) + ']' : '')); };
  const open = async (deal) => { const p = await b.newPage({ viewport: { width: 1400, height: 900 } }); p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
    await p.route(/supabase\.co|vercel\.app|fonts\.g|cdn\.jsdelivr/, r => r.abort()); await p.goto('file://' + path.resolve(process.argv[2])); await p.waitForTimeout(700);
    await p.evaluate((d) => { document.documentElement.classList.add('bk-auth-ok'); localStorage.setItem('bk-pt-all', '1'); bkCreateNewDeal(d); const s = bkLoad(); Object.assign(s, d); bkSave(s); }, deal); return p; };
  const BLANK = { dealId: { dealId: '' }, name: { name: '' }, propertyType: { propertyType: '' }, closing: { closing: '' }, purchasePrice: { purchasePrice: 0 }, size: { units: 0, gsf: 0, commercialArea: 0 }, revenue: { avgRent: 0, commercialRent: 0, rentRoll: [] }, holdYears: { holdYears: 0 }, exitCap: { exitCap: 0 }, constructionMonths: { constructionMonths: 0 } };
  const view = (p) => p.evaluate(async () => { showSheet('Deal Underwrite'); await new Promise(r => setTimeout(r, 1100));
    const rd = bkDealReadiness(), rows = [...document.querySelectorAll('#viewport tr[data-bk-key]')].map(tr => ({ key: tr.getAttribute('data-bk-key'), flagged: tr.classList.contains('bk-req-missing'), chip: ((tr.querySelector('.status-chip') || {}).textContent || '').trim(), cls: ((tr.querySelector('.status-chip') || {}).className || '') }));
    const bar = (document.querySelector('.bk-req b') || { textContent: '' }).textContent, rr = bkRequiredRows();
    showSheet('Home'); await new Promise(r => setTimeout(r, 900)); const home = document.querySelector('#viewport').innerText;
    return { rows, bar, missing: rd.missing.map(m => m.key), met: rd.met.length, total: rd.met.length + rd.missing.length, rr, home, state: rd.state }; });

  for (const [label, deal, keys] of [['acquisition', A, ['dealId', 'name', 'propertyType', 'closing', 'purchasePrice', 'size', 'revenue', 'holdYears', 'exitCap']], ['development', D, ['dealId', 'purchasePrice', 'holdYears', 'exitCap', 'constructionMonths']]]) {
    const p = await open(deal);
    const ok0 = await view(p);
    check(label + ': a complete deal has no REQUIRED marker, no MISSING chip, and the bar says so', ok0.missing.length === 0 && !ok0.rows.some(r => r.flagged || r.chip === 'MISSING') && new RegExp('Required inputs: ' + ok0.total + ' of ' + ok0.total).test(ok0.bar), JSON.stringify([ok0.missing, ok0.bar]));
    const rowOk = ok0.rows.filter(r => r.chip === 'OK' || r.chip === 'TEMPLATE' || r.chip === 'N/A'); check(label + ': the Status chips of a complete deal are OK, TEMPLATE or N/A only', rowOk.length === ok0.rows.length && ok0.rows.length > 20, ok0.rows.length);
    for (const k of keys) {
      await p.evaluate((patch) => { const s = bkLoad(); Object.assign(s, patch); bkSave(s); }, BLANK[k]);
      const v = await view(p), rowKey = ({ size: 'units', revenue: 'avgRent' })[k] || k, row = v.rows.find(r => r.key === rowKey);
      check(label + ' / ' + k + ' blank: readiness says it is missing', v.missing.includes(k), v.missing.join());
      check(label + ' / ' + k + ' blank: the row is marked REQUIRED and its Status chip says MISSING (not OK)', row && row.flagged && row.chip === 'MISSING' && /fail/.test(row.cls), JSON.stringify(row));
      check(label + ' / ' + k + ' blank: no row is marked REQUIRED with an OK chip, and no MISSING chip sits on an unmarked row', !v.rows.some(r => (r.flagged && r.chip !== 'MISSING') || (!r.flagged && r.chip === 'MISSING')), JSON.stringify(v.rows.filter(r => r.flagged || r.chip === 'MISSING')));
      check(label + ' / ' + k + ' blank: the bar counts the same (' + v.met + ' of ' + v.total + ') and the Home page says the same number missing (' + v.missing.length + ')', new RegExp('Required inputs: ' + v.met + ' of ' + v.total).test(v.bar) && new RegExp(v.missing.length + ' still missing').test(v.home), v.bar + ' | ' + (v.home.match(/\d+ still missing|Complete/) || [''])[0]);
      await p.evaluate((d) => { const s = bkLoad(); Object.assign(s, d); bkSave(s); }, deal);
    }
    /* two blank at once, and the exact same set on every surface */
    await p.evaluate(() => { const s = bkLoad(); s.exitCap = 0; s.holdYears = 0; s.name = ''; bkSave(s); });
    const two = await view(p);
    check(label + ': three blank at once, every marked row has a MISSING chip and the counts agree (' + two.missing.length + ' missing)', two.rows.filter(r => r.flagged).length === two.missing.length && two.rows.filter(r => r.chip === 'MISSING').length === two.missing.length && new RegExp(two.missing.length + ' still missing').test(two.home), JSON.stringify(two.rows.filter(r => r.flagged).map(r => r.key + ':' + r.chip)));
    await p.evaluate((d) => { const s = bkLoad(); Object.assign(s, d); bkSave(s); }, deal);
    const back = await view(p);
    check(label + ': filling them in again clears every marker and chip', back.missing.length === 0 && !back.rows.some(r => r.flagged || r.chip === 'MISSING') && /All required|Required inputs: \d+ of \d+/.test(back.bar), back.bar);
    check(label + ': no page errors', p.errs.length === 0, p.errs.join(' | ')); await p.close();
  }
  /* development inputs on an acquisition say N/A, and the acquisition-only conventions on a development do too */
  const na = async (deal) => { const q = await open(deal); const r = await q.evaluate(async () => { showSheet('Deal Underwrite'); await new Promise(res => setTimeout(res, 1100)); const out = { na: [], notNa: [], devTables: 0 };
      document.querySelectorAll('#viewport .tbl-wrap').forEach(w => { const c = w.querySelector('caption'); if (!c) return; const t = c.textContent.replace(/\s+/g, ' ').trim(); const rows = [...w.querySelectorAll('tbody tr')].map(tr => ({ key: tr.getAttribute('data-bk-key'), chip: ((tr.querySelector('.status-chip') || {}).textContent || '').trim(), dim: tr.classList.contains('bk-na'), flagged: tr.classList.contains('bk-req-missing') }));
        if (/^(Development\b|Construction Facility|Permanent \/ Stabilized Debt)/.test(t)) { out.devTables++; out.dev = (out.dev || []).concat(rows); } if (/Acquisition Deals Only/.test(t)) out.conv = (out.conv || []).concat(rows); if (/^(Identity|Program|Exit & Hold|Acquisition Debt)$/.test(t)) out.core = (out.core || []).concat(rows); });
      return out; }, deal); await q.close(); return r; };
  const an = await na(A), dn = await na(D);
  check('acquisition: every row in the development tables reads N/A and is dimmed (building area, shared with Program, is left alone)', an.devTables === 5 && an.dev.filter(r => r.key !== 'gsf').every(r => r.chip === 'N/A' && r.dim && !r.flagged) && an.dev.filter(r => r.chip === 'N/A').length >= 20, JSON.stringify([an.devTables, an.dev.filter(r => r.chip !== 'N/A').map(r => r.key + ':' + r.chip)]));
  check('acquisition: the rows that do apply are not N/A', an.core.length > 15 && an.core.every(r => r.chip !== 'N/A' && !r.dim), JSON.stringify(an.core.filter(r => r.chip === 'N/A')));
  check('development: the development tables are live (no N/A) and the acquisition-only conventions read N/A', dn.dev.every(r => r.chip !== 'N/A' && !r.dim) && dn.conv && dn.conv.length > 2 && dn.conv.every(r => r.chip === 'N/A'), JSON.stringify([dn.dev.filter(r => r.chip === 'N/A').length, (dn.conv || []).map(r => r.chip)]));
  /* a pre-filled template value is still labelled TEMPLATE, and a template value that is required and blank is MISSING, not TEMPLATE */
  const t = await open(A);
  const tpl = await t.evaluate(async () => { const s = bkLoad(); s._template = { name: 'x', values: { exitCap: s.exitCap, vacancy: s.vacancy } }; bkSave(s); showSheet('Deal Underwrite'); await new Promise(r => setTimeout(r, 1000));
    const chip = (k) => ((document.querySelector('#viewport tr[data-bk-key="' + k + '"] .status-chip') || {}).textContent || '').trim(); const out = { exitCap: chip('exitCap'), vacancy: chip('vacancy') };
    const s2 = bkLoad(); s2.exitCap = 0; s2._template.values.exitCap = 0; bkSave(s2); showSheet('Deal Underwrite'); await new Promise(r => setTimeout(r, 1000)); out.blankExit = chip('exitCap'); return out; });
  check('a value pre-filled from a template reads TEMPLATE until you change it, and a required template value that is blank reads MISSING', tpl.exitCap === 'TEMPLATE' && tpl.vacancy === 'TEMPLATE' && tpl.blankExit === 'MISSING', JSON.stringify(tpl)); await t.close();
  console.log('required_status: ' + checks + ' checks, ' + fails + ' failures'); await b.close(); process.exit(fails ? 1 : 0);
})();
