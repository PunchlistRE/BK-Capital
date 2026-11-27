// Inputs index (src/221): one page that lists every input the open analysis uses, grouped Property / Market / Revenue / Expenses / Debt / Tax / Investors / Returns,
// says what is entered, needed or incomplete, marks what depends on the deal's choices, and opens the real box on its real page. It is an index, not another place to type.
//   node audit/inputs_index_test.js index.html
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); const path = require('path');
const A = require(path.join(__dirname, 'deal.js')), D = require(path.join(__dirname, 'devdeal.js'));
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  let checks = 0, fails = 0; const check = (n, ok, d) => { checks++; if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? '  [' + String(d).slice(0, 400) + ']' : '')); };
  const open = async (w, deal) => { const ctx = await b.newContext({ viewport: { width: w || 1300, height: 1000 } }), p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
    await p.route(/supabase\.co|vercel\.app|fonts\.g|cdn\.jsdelivr/, r => r.abort()); await p.goto('file://' + path.resolve(process.argv[2])); await p.waitForTimeout(700);
    if (deal) await p.evaluate((d) => { document.documentElement.classList.add('bk-auth-ok'); bkCreateNewDeal(d); }, deal); return p; };
  const show = async (p) => { await p.evaluate(() => showSheet('Inputs Index')); await p.waitForTimeout(500); };
  const set = (p, patch) => p.evaluate((x) => { const s = bkLoad(); Object.assign(s, x); bkSave(s); showSheet('Inputs Index'); }, patch).then(() => p.waitForTimeout(400));

  /* ---- where it is ---- */
  const p = await open(1300, A); await show(p);
  const nav = await p.evaluate(() => ({ tabs: NAV_TABS.map(t => t.label), g: GROUPS.find(g => g.tab === 'inputs'), cur: currentSheet, top: [...document.querySelectorAll('.tabnav-primary .grp-btn')].map(x => x.textContent.trim()) }));
  check('Inputs is the second tab, right after Overview, and holds the one page', nav.tabs[0] === 'Overview' && nav.tabs[1] === 'Inputs' && nav.g && nav.g.sheets.join() === 'Inputs Index' && nav.cur === 'Inputs Index' && nav.top[1] === 'Inputs', JSON.stringify(nav.top));

  /* ---- what it lists: every input the analysis asks for, once ---- */
  const L = await p.evaluate(() => { const ix = bkInputsIndex(), rows = ix.rows.map(r => r.k), keys = []; BKReg.workflow(ix.analysis.id).forEach(st => (st.fields || []).forEach(e => { const f = BKReg.field(e.k); if (f && !f.planned && f.kind !== 'derived' && keys.indexOf(e.k) < 0) keys.push(e.k); }));
    const dom = [...document.querySelectorAll('#viewport tr.bk-ix-r')].map(r => r.dataset.ixK);
    return { rows, keys, dom, groups: [...document.querySelectorAll('#viewport details.bk-ix-g')].map(g => g.dataset.ixG), a: ix.analysis.id }; });
  check('every input of the analysis\'s workflow is listed exactly once (' + L.keys.length + ' inputs), none invented', L.rows.length === L.keys.length && L.rows.slice().sort().join() === L.keys.slice().sort().join() && new Set(L.dom).size === L.dom.length && L.dom.slice().sort().join() === L.keys.slice().sort().join(), L.rows.length + ' rows / ' + L.keys.length + ' / ' + L.dom.length + ' on the page');
  const ORDER = ['Property', 'Market', 'Revenue', 'Expenses', 'Debt', 'Tax', 'Investors', 'Returns'];
  check('the inputs are grouped under Property, Market, Revenue, Expenses, Debt, Tax, Investors and Returns, in that order', L.groups.length >= 5 && L.groups.every(g => ORDER.includes(g)) && L.groups.join() === ORDER.filter(g => L.groups.includes(g)).join(), L.groups.join());

  /* ---- entered / needed, from the deal itself ---- */
  const st = () => p.evaluate(() => { const s = bkLoad(), ix = bkInputsIndex(), by = {}; ix.rows.forEach(r => by[r.k] = r.status); const need = ix.rows.filter(r => r.req === 'required');
    return { avg: by.avgRent, price: by.purchasePrice, entered: need.filter(r => r.present).length, need: need.length, top: (document.querySelector('.bk-ix-sum') || {}).innerText || '', exp: ix.rows.every(r => r.present === BKReg.present(r.k, s)) }; });
  const s1 = await st();
  check('a figure that is in the deal reads Entered, with its value, and the sentence at the top counts the required ones', s1.avg === 'entered' && s1.price === 'entered' && s1.exp && new RegExp('^' + s1.entered + ' of ' + s1.need + '\\b').test(s1.top.trim()), JSON.stringify(s1));
  await set(p, { avgRent: 0 }); const s2 = await st();
  check('clearing the average rent turns it to Needed and lowers the entered count by exactly one', s2.avg === 'missing' && s2.entered === s1.entered - 1 && s2.need === s1.need, JSON.stringify([s1.entered, s2.entered]));
  check('the first missing input is offered as the next one to enter', /Next:/.test(s2.top) && /Average rent/.test(s2.top), s2.top);
  await set(p, { avgRent: 1650 }); const s3 = await st();
  check('putting it back restores Entered and the count', s3.avg === 'entered' && s3.entered === s1.entered, JSON.stringify([s3.avg, s3.entered]));

  /* ---- the model's own gate is shown on its own, from the readiness check ---- */
  const pb = await open(1300, Object.assign({}, A, { holdYears: '', exitCap: '' })); await show(pb);
  const gt = await pb.evaluate(() => { const rd = bkDealReadiness(), el = document.querySelector('.bk-ix-gate'); return { n: rd.canCalculate === false ? rd.missing.length : 0, txt: el ? el.innerText : '', links: el ? el.querySelectorAll('button').length : 0 }; });
  check('when results are withheld the page names the inputs the model is waiting for (' + gt.n + '), with a link on each', gt.n >= 2 && new RegExp('withheld until ' + gt.n + ' inputs').test(gt.txt) && gt.links === gt.n && /Hold Period/i.test(gt.txt), gt.txt);
  await pb.context().close();

  /* ---- depends on the deal's choices ---- */
  const cond = async (strategy) => { await set(p, { acqStrategy: strategy, renoUnitsPerYear: 0 }); return p.evaluate(() => { const ix = bkInputsIndex(), r = ix.rows.find(x => x.k === 'renoUnitsPerYear'); const inNa = !!document.querySelector('details.bk-ix-fold tr[data-ix-k="renoUnitsPerYear"]') && [...document.querySelectorAll('details.bk-ix-fold')].some(d => /Do not apply/.test(d.querySelector('summary').textContent) && d.querySelector('tr[data-ix-k="renoUnitsPerYear"]')); return { req: r && r.req, status: r && r.status, depends: r && r.depends, inNa }; }); };
  const c1 = await cond('Stabilized'), c2 = await cond('Value-add');
  check('with a stabilized strategy the renovation inputs do not apply and sit behind "Do not apply to this deal"', c1.req === 'na' && c1.inNa && c1.depends, JSON.stringify(c1));
  check('switching to value-add brings them in (no longer "not needed") and marks them as depending on the choices', c2.req !== 'na' && !c2.inNa && c2.depends && /depends on your choices/.test(await p.evaluate(() => document.querySelector('tr[data-ix-k="renoUnitsPerYear"]').textContent)), JSON.stringify(c2));
  await set(p, { acqStrategy: A.acqStrategy });

  /* ---- incomplete ---- */
  /* the unit-by-unit rent roll is an input of the property valuation analysis (its Unit mix and rent roll step) */
  await set(p, { analysisType: 'valuation', units: 10, rentRoll: [{ unitId: '1', tenantType: 'Residential', unitType: '1 BR', sf: 700, status: 'Occupied', inPlaceRent: 1600, marketRent: 1650 }, { unitId: '2', tenantType: 'Residential', unitType: '1 BR', sf: 700, status: 'Occupied', inPlaceRent: 1600, marketRent: 1650 }] });
  const inc = await p.evaluate(() => { const r = bkInputsIndex().rows.find(x => x.k === 'rentRoll'); const tr = document.querySelector('tr[data-ix-k="rentRoll"]'); return { s: r && r.status, note: r && r.note, txt: tr ? tr.textContent : '' }; });
  check('a rent roll with 2 of 10 units listed reads Incomplete and says so', inc.s === 'incomplete' && /2 of 10 units/.test(inc.txt), JSON.stringify(inc));
  await set(p, { analysisType: A.analysisType || 'acquisition', units: A.units, rentRoll: A.rentRoll || [] });

  /* ---- it is an index, not another input form ---- */
  const ctl = await p.evaluate(() => ({ inputs: document.querySelectorAll('#viewport input, #viewport select, #viewport textarea, #viewport [contenteditable="true"]').length, btns: document.querySelectorAll('#viewport button.bk-btn').length }));
  check('the page has no input boxes (only buttons that open the real ones; none on a row that does not apply)', ctl.inputs === 0 && ctl.btns > 5, JSON.stringify(ctl));
  const before = await p.evaluate(() => JSON.stringify(bkLoad()));
  await p.evaluate(() => { document.querySelectorAll('#viewport details').forEach(d => d.open = true); bkInputsJump('Debt'); }); await p.waitForTimeout(300);
  check('opening every group changes nothing in the deal', before === await p.evaluate(() => JSON.stringify(bkLoad())));
  check('no NaN, undefined or [object] on the page', !(await p.evaluate(() => /undefined|NaN|\[object/.test(document.querySelector('#viewport').innerText))));

  /* ---- progressive: the group that needs something opens, the rest are folded ---- */
  await set(p, { avgRent: 0 });
  const pr = await p.evaluate(() => { const g = [...document.querySelectorAll('#viewport details.bk-ix-g')]; return { open: g.filter(x => x.open).map(x => x.dataset.ixG), miss: g.filter(x => x.querySelector('tr.bk-ix-missing')).map(x => x.dataset.ixG), opt: [...document.querySelectorAll('details.bk-ix-fold')].filter(x => x.open).length }; });
  check('only the first group that still needs something is open; optional and not-applicable inputs are folded', pr.open.length === 1 && pr.open[0] === pr.miss[0] && pr.opt === 0, JSON.stringify(pr));
  await set(p, { avgRent: 1650 });

  /* ---- every row opens the real box ---- */
  const rows = await p.evaluate(() => bkInputsIndex().rows.filter(r => r.status !== 'na').map(r => r.k)); const bad = [], guideOnly = [];   /* a row that does not apply to this deal has no box drawn and no button */
  for (const k of rows) {
    await p.evaluate(() => showSheet('Inputs Index')); await p.waitForTimeout(120);
    await p.evaluate((kk) => bkInputsGo(kk), k);
    const probe = (kk) => ({ cur: currentSheet, box: !!document.getElementById('ae-' + kk) || !!document.querySelector('#viewport [data-bk-key="' + kk + '"], #viewport [onchange*="\'' + kk + '\'"], #viewport [onchange*="Set' + kk.charAt(0).toUpperCase() + kk.slice(1) + '("]'), guide: document.documentElement.classList.contains('bk-guide') && !!document.querySelector('.gd [id$="-' + kk + '"]'), flash: !!document.querySelector('.bk-ask-flash') });
    let r = null; for (let n = 0; n < 24; n++) { await p.waitForTimeout(250); r = await p.evaluate(probe, k); if ((r.box && r.flash) || r.guide) break; }   /* the pages are tried in turn, so wait until it has landed */
    if (r.guide) guideOnly.push(k); else if (r.box) { if (!r.flash) bad.push(k + ': box on ' + r.cur + ' but not highlighted'); } else bad.push(k + ': no box on ' + r.cur);
    await p.evaluate(() => { try { bkGuideOff(); } catch (e) {} });
  }
  check('Enter / Change takes you to the box itself, highlighted, for every input that applies (' + rows.length + ' inputs)', bad.length === 0, bad.join(' | '));
  check('an input that no page draws for this deal (the plan for the property) opens the guide at the step that asks it, with its question on screen', guideOnly.join() === 'acqStrategy', guideOnly.join());
  await p.context().close();

  /* ---- development deal, no deal, phone ---- */
  const pd = await open(1300, D); await show(pd);
  const dv = await pd.evaluate(() => { const ix = bkInputsIndex(); return { a: ix.analysis.id, n: ix.rows.length, g: [...document.querySelectorAll('#viewport details.bk-ix-g')].map(x => x.dataset.ixG), has: ix.rows.some(r => r.k === 'constructionMonths'), bad: /undefined|NaN|\[object/.test(document.querySelector('#viewport').innerText) }; });
  check('a development deal lists its own inputs (construction period, budget) under the same groups, without NaN or undefined', dv.a === 'development' && dv.has && dv.g.length >= 4 && !dv.bad, JSON.stringify(dv));
  check('no page errors on a development deal', pd.errs.length === 0, pd.errs.join('|')); await pd.context().close();

  const pn = await open(1300, null); await pn.evaluate(() => { document.documentElement.classList.add('bk-auth-ok'); try { localStorage.clear(); } catch (e) {} }); await pn.reload(); await pn.waitForTimeout(700);
  await pn.evaluate(() => { document.documentElement.classList.add('bk-auth-ok'); showSheet('Inputs Index'); }); await pn.waitForTimeout(500);
  const nd = await pn.evaluate(() => ({ rows: document.querySelectorAll('#viewport tr.bk-ix-r').length, txt: document.querySelector('#viewport').innerText }));
  check('with no deal open it says so and lists nothing', nd.rows === 0 && /no open deal/i.test(nd.txt), nd.txt.slice(0, 120)); await pn.context().close();

  const ph = await open(390, A); await show(ph);
  const pw = await ph.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth, over: [...document.querySelectorAll('#viewport .bk-ix-g, #viewport .bk-ix-top')].filter(e => e.getBoundingClientRect().right > window.innerWidth + 1).length }));
  check('on a phone the page does not scroll sideways', pw.sw <= pw.iw + 1 && pw.over === 0, JSON.stringify(pw)); await ph.context().close();

  console.log('inputs index: ' + checks + ' checks, ' + fails + ' failures'); await b.close(); process.exit(fails ? 1 : 0);
})();
