// Undo and Redo for every function. Every change to anything the app keeps (the open deal, the portfolio, the investor registry, saved templates, the importer's learned wording...) is a step
// with a label; Undo / Redo put every store back EXACTLY (byte for byte) as it was or as it became; a change that would move the model drastically is confirmed first, with what it will change.
//   node audit/undo_test.js index.html
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); const path = require('path');
const A = require(path.join(__dirname, 'deal.js')), D = require(path.join(__dirname, 'devdeal.js'));
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  let checks = 0, fails = 0; const check = (n, ok, d) => { checks++; if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? '  [' + String(d).slice(0, 300) + ']' : '')); };
  const open = async (deal, extra) => { const p = await b.newPage({ viewport: { width: 1400, height: 900 } }); p.errs = []; p.on('pageerror', e => p.errs.push(e.message)); p.on('dialog', d => d.accept());
    await p.route(/supabase\.co|vercel\.app|fonts\.g|cdn\.jsdelivr/, r => r.abort()); await p.goto('file://' + path.resolve(process.argv[2])); await p.waitForTimeout(700);
    await p.evaluate(([d, x]) => { document.documentElement.classList.add('bk-auth-ok'); localStorage.setItem('bk-pt-all', '1'); bkCreateNewDeal(d); const s = bkLoad(); Object.assign(s, d, x || {}); bkSave(s); }, [deal, extra || {}]);
    await p.waitForTimeout(300); return p; };
  const state = (p) => p.evaluate(() => bkUndoState());
  const same = async (p, a) => p.evaluate((a) => { const n = bkUndoSnapshot(), nh = (r) => { try { const o = JSON.parse(r); delete o._history; return JSON.stringify(o); } catch (e) { return r; } }; return Object.keys(a).every(k => k === 'bkcapital.cre.v02' ? nh(a[k]) === nh(n[k]) : a[k] === n[k]); }, a);
  const snap = (p) => p.evaluate(() => bkUndoSnapshot());

  /* ---- one action at a time: a step, an exact Undo, an exact Redo ---- */
  const ACQ = [
    ['an editor field (exit cap)', async (p) => { await p.evaluate(() => { bkEdGo('Valuation', 'Valuation', 'exit'); }); await p.waitForTimeout(500); await p.evaluate(() => bkEdSet('exitCap', 'pct', '6.25')); }],
    ['a Deal Underwrite field (hold period)', (p) => p.evaluate(() => bkSetField('holdYears', '7'))],
    ['a dropdown (property type)', (p) => p.evaluate(() => bkSetField('propertyType', 'Mixed-Use'))],
    ['the case switch (Downside)', async (p) => { await p.evaluate(() => showSheet('Home')); await p.waitForTimeout(400); await p.evaluate(() => document.querySelector('[data-bk-case="Downside"]').click()); }],
    ['a rent roll row added', (p) => p.evaluate(() => bkRRAdd())],
    ['a rent roll row removed', async (p) => { await p.evaluate(() => bkRRRemove(0)); }, async (p) => { await p.evaluate(() => bkRRAdd()); await p.waitForTimeout(150); }],
    ['a commercial lease added', (p) => p.evaluate(() => bkLeaseAdd())],
    ['an other-income line added', (p) => p.evaluate(() => bkEdMiscAdd())],
    ['a capital item added', (p) => p.evaluate(() => bkEdCapAdd())],
    ['an assumption template saved', async (p) => { await p.evaluate(() => { bkEdGo('Property', 'Property', 'tpl'); }); await p.waitForTimeout(500); await p.evaluate(() => { const i = document.getElementById('ae-tpl-name'); i.value = 'Garden multifamily'; bkEdTplSave(); }); }],
    ['an investor added to the registry', (p) => p.evaluate(() => bkInvestorRegistryAdd({ name: 'Undo Test Investor' }))],
    ['the deal saved to the portfolio', (p) => p.evaluate(() => bkPortfolioAddCurrent())],
    ['expense wording learned by the importer', (p) => p.evaluate(() => bkLearn.set('Gardening and snow', 'contract'))],
  ];
  for (const [name, act, setup] of ACQ) {
    const p = await open(A, { purchasePrice: 19800000 }); await p.evaluate(() => { showSheet('Home'); }); await p.waitForTimeout(500); if (setup) await setup(p);
    const s0 = await snap(p), n0 = (await state(p)).undo.length; await act(p); await p.waitForTimeout(250);
    const s1 = await snap(p), st = await state(p), changed = JSON.stringify(s0) !== JSON.stringify(s1);
    check(name + ': it is a step with a label', changed && st.undo.length === n0 + 1 && /\S/.test(st.undo[st.undo.length - 1]) && st.undo[st.undo.length - 1] !== 'Change', JSON.stringify(st.undo.slice(-2)));
    await p.evaluate(() => bkUndo({ confirmed: true })); await p.waitForTimeout(250);
    check(name + ': Undo puts every store back exactly as it was', await same(p, s0));
    const st2 = await state(p); check(name + ': and it is on the Redo list', st2.redo.length === 1 && st2.undo.length === n0);
    await p.evaluate(() => bkRedo({ confirmed: true })); await p.waitForTimeout(250);
    check(name + ': Redo puts every store back exactly as it became', await same(p, s1));
    await p.context().close();
  }
  /* the development functions */
  const DEVA = [
    ['the schedule switched to tasks', (p) => p.evaluate(() => { bkDevGanttMode('tasks'); })],
    ['a schedule task added', async (p) => { await p.evaluate(() => bkDevGanttMode('tasks')); await p.waitForTimeout(200); await p.evaluate(() => bkDevGanttAdd()); }],
    ['a schedule task\'s duration changed', async (p) => { await p.evaluate(() => bkDevGanttMode('tasks')); await p.waitForTimeout(200); await p.evaluate(() => bkDevGanttField(1, 'dur', '9')); }],
    ['a schedule task removed', async (p) => { await p.evaluate(() => bkDevGanttMode('tasks')); await p.waitForTimeout(200); await p.evaluate(() => bkDevGanttRemove(1)); }],
    ['the standard development case stress applied', async (p) => { await p.evaluate(() => { const s = bkLoad(); ['downHardCostVariance', 'downConstructionMoDelta', 'downAbsorptionFactor', 'upAbsorptionFactor'].forEach(k => { s[k] = 0; }); delete s._caseDefaults; bkSave(s); }); await p.waitForTimeout(200); await p.evaluate(() => bkCaseApplyDevDefaults()); }],
  ];
  for (const [name, act] of DEVA) {
    const p = await open(D); await p.evaluate(() => { showSheet('Home'); }); await p.waitForTimeout(500);
    const s0 = await snap(p), n0 = (await state(p)).undo.length; await act(p); await p.waitForTimeout(250);
    const mid = await state(p); const sPre = await snap(p);
    // for the actions that need a set-up step, step back to the start of THIS action only
    const k = mid.undo.length - n0; let s1 = sPre;
    await p.evaluate(() => bkUndo({ confirmed: true })); await p.waitForTimeout(200); const sUn = await snap(p);
    check(name + ': Undo takes back the last step exactly, and Redo brings it back exactly', JSON.stringify(sUn) !== JSON.stringify(s1) && k >= 1, 'steps ' + k);
    await p.evaluate(() => bkRedo({ confirmed: true })); await p.waitForTimeout(200); check(name + ': Redo restores exactly', await same(p, s1));
    for (let i = 0; i < k; i++) { await p.evaluate(() => bkUndo({ confirmed: true })); await p.waitForTimeout(120); }
    check(name + ': undoing all ' + k + ' of its steps returns the deal to where it started', await same(p, s0));
    await p.context().close();
  }

  /* ---- a run of steps, in order; a new change after an Undo clears Redo ---- */
  { const p = await open(A, { purchasePrice: 19800000 }); await p.evaluate(() => showSheet('Home')); await p.waitForTimeout(500); const s0 = await snap(p), nA = (await state(p)).undo.length; const labels = [];
    await p.evaluate(() => bkSetField('holdYears', '6')); await p.waitForTimeout(100); await p.evaluate(() => bkSetField('vacancy', '0.06')); await p.waitForTimeout(100); await p.evaluate(() => bkSetField('rentGrowth', '0.035')); await p.waitForTimeout(100);
    const st = await state(p); check('three edits are three steps, labelled with what changed and the values (e.g. "Hold period 5 → 6")', st.undo.length === nA + 3 && /Hold period/.test(st.undo[nA]) && /5.*6/.test(st.undo[nA]) && /Vacancy/.test(st.undo[nA + 1]) && /Rent growth/.test(st.undo[nA + 2]), JSON.stringify(st.undo));
    const btn = await p.evaluate(() => { showSheet('Home'); return null; }); await p.waitForTimeout(500);
    const tip = await p.evaluate(() => document.querySelector('[data-bk-undo]').title); check('the Undo button says what it will undo', /Undo: Rent growth/.test(tip), tip);
    await p.keyboard.press('Control+z'); await p.waitForTimeout(300); if (await p.$('#bk-undo-ask')) { await p.click('#bk-undo-ask [data-ask="go"]'); await p.waitForTimeout(250); } let s = await state(p); check('Ctrl+Z undoes the last step', s.undo.length === nA + 2 && s.redo.length === 1, JSON.stringify(s));
    await p.keyboard.press('Control+Shift+z'); await p.waitForTimeout(300); if (await p.$('#bk-undo-ask')) { await p.click('#bk-undo-ask [data-ask="go"]'); await p.waitForTimeout(250); } s = await state(p); check('Ctrl+Shift+Z redoes it', s.undo.length === nA + 3 && s.redo.length === 0);
    for (let i = 0; i < 3; i++) { await p.evaluate(() => bkUndo({ confirmed: true })); await p.waitForTimeout(120); } check('three Undos return to the start exactly', await same(p, s0));
    await p.evaluate(() => bkSetField('holdYears', '8')); await p.waitForTimeout(100); s = await state(p); check('a new change after an Undo clears Redo', s.redo.length === 0 && s.undo.length === nA + 1);
    await p.context().close(); }

  /* ---- the app's own writes are not steps ---- */
  { const p = await open(A, { purchasePrice: 19800000 }); await p.waitForTimeout(300); const n0 = (await state(p)).undo.length;
    await p.evaluate(async () => { for (const sh of ['Home', 'Deal Underwrite', 'Property', 'Debt', 'Returns', 'Rent Roll', 'Depreciation', 'Covenant Monitor', 'Tenants', 'Sensitivity']) { showSheet(sh); await new Promise(r => setTimeout(r, 450)); } });
    check('opening ten pages (some fill in missing defaults) adds no steps', (await state(p)).undo.length === n0, (await state(p)).undo.length - n0);
    await p.evaluate(() => { BK_SYNC.suspend++; try { const s = bkLoad(); s.name = 'Pulled from the cloud'; bkSave(s); } finally { BK_SYNC.suspend--; } }); await p.waitForTimeout(200);
    check('a write made by the cloud sync is not a step', (await state(p)).undo.length === n0);
    await p.evaluate(() => bkUndoQuiet(() => { const s = bkLoad(); s.name = 'Housekeeping'; bkSave(s); })); await p.waitForTimeout(200); check('housekeeping writes can opt out (bkUndoQuiet)', (await state(p)).undo.length === n0);
    await p.evaluate(() => { for (let i = 0; i < 60; i++) { const s = bkLoad(); s.holdYears = 5 + (i % 7) + 1; bkSave(s); } }); await p.waitForTimeout(200); await p.evaluate(() => { for (let i = 0; i < 60; i++) { const s = bkLoad(); s.holdYears = 3 + (i % 4); bkSave(s); } });
    check('only the last fifty steps are kept', (await state(p)).undo.length <= 50); await p.context().close(); }
  /* one click that writes several stores is ONE step */
  { const p = await open(A, { purchasePrice: 19800000 }); await p.waitForTimeout(300); const n0 = (await state(p)).undo.length; await p.evaluate(() => { bkPortfolioAddCurrent(); bkLearn.set('Window cleaning', 'contract'); const s = bkLoad(); s.holdYears = 9; bkSave(s); }); await p.waitForTimeout(250);
    const st = await state(p); check('several stores changed by one action are one step, and the label names them', st.undo.length === n0 + 1 && /Changes to the portfolio/.test(st.undo[st.undo.length - 1]), st.undo[st.undo.length - 1]);
    const s0 = null; await p.context().close(); }

  /* ---- drastic changes are confirmed first ---- */
  { const p = await open(A, { purchasePrice: 19800000 }); await p.evaluate(() => showSheet('Home')); await p.waitForTimeout(500); const before = await snap(p);
    await p.evaluate(() => bkSetField('exitCap', '0.09')); await p.waitForTimeout(200); const after = await snap(p);
    await p.evaluate(() => { window.__r = bkUndo(); }); await p.waitForTimeout(500);
    const ask = await p.evaluate(() => { const o = document.getElementById('bk-undo-ask'); return o ? { text: o.innerText, focus: document.activeElement && document.activeElement.getAttribute('data-ask'), done: window.__r } : null; });
    check('Undo of a change that moves the IRR by more than a point asks first, and says what it will do (the IRR, from and to)', ask && /Levered IRR goes from .*% to .*%/.test(ask.text) && /Exit cap/.test(ask.text) && ask.done === false, ask && ask.text.replace(/\n/g, ' | '));
    check('nothing has been changed while it waits, and Cancel is the default', await same(p, after) && ask.focus === 'cancel');
    await p.keyboard.press('Escape'); await p.waitForTimeout(200); check('Escape cancels: nothing changed and the step is still there', await same(p, after) && (await state(p)).undo.length >= 1 && !(await state(p)).pending);
    await p.evaluate(() => { bkUndo(); }); await p.waitForTimeout(300); await p.click('#bk-undo-ask [data-ask="cancel"]'); await p.waitForTimeout(200); check('the Cancel button leaves everything as it is', await same(p, after) && !(await state(p)).pending);
    await p.evaluate(() => { bkUndo(); }); await p.waitForTimeout(300); await p.click('#bk-undo-ask [data-ask="go"]'); await p.waitForTimeout(400); check('"Undo anyway" carries it out, exactly', await same(p, before) && !(await state(p)).pending);
    check('and a toast says what was undone, with a Redo link', await p.evaluate(() => { const t = document.getElementById('bk-undo-toast'); return !!t && t.classList.contains('on') && /Undone: Exit cap/.test(t.innerText) && !!t.querySelector('[data-bk-redo]'); }));
    await p.evaluate(() => { bkRedo(); }); await p.waitForTimeout(300); const rask = await p.evaluate(() => { const o = document.getElementById('bk-undo-ask'); return o ? o.innerText : null; });
    check('Redo of the same change asks too (the IRR comes back down), and Redo anyway restores it exactly', !!rask && /Levered IRR goes from/.test(rask) && (await p.click('#bk-undo-ask [data-ask="go"]'), await p.waitForTimeout(400), await same(p, after)), rask && rask.replace(/\n/g, ' | ').slice(0, 120));
    await p.context().close(); }
  { const p = await open(A, { purchasePrice: 19800000 }); await p.evaluate(() => showSheet('Home')); await p.waitForTimeout(500);
    await p.evaluate(() => bkSetField('closingCostsPct', '0.0205')); await p.waitForTimeout(200); const r = await p.evaluate(() => bkUndo()); await p.waitForTimeout(300);
    check('a small change is undone straight away, with no question, and the toast says so', r === true && !(await state(p)).pending && (await p.evaluate(() => /Undone/.test(document.getElementById('bk-undo-toast').innerText)))); await p.context().close(); }
  { const p = await open(A, { purchasePrice: 19800000 }); await p.evaluate(() => showSheet('Home')); await p.waitForTimeout(500); const first = await snap(p);
    await p.evaluate((d) => { bkCreateNewDeal(d); }, D); await p.waitForTimeout(400);
    await p.evaluate(() => { bkUndo(); }); await p.waitForTimeout(500); const a2 = await p.evaluate(() => { const o = document.getElementById('bk-undo-ask'); return o ? o.innerText : null; });
    check('Undo of "new deal" asks, naming the deal it brings back and the one it takes away', !!a2 && /switches the open deal from/.test(a2) && /Audit Test Development/.test(a2) && /Audit Test Apartments/.test(a2), a2 && a2.replace(/\n/g, ' | ').slice(0, 200));
    await p.click('#bk-undo-ask [data-ask="go"]'); await p.waitForTimeout(400); check('and the first deal is back exactly as it was', await same(p, first)); await p.context().close(); }
  { const p = await open(A, { purchasePrice: 19800000 }); await p.evaluate(() => showSheet('Home')); await p.waitForTimeout(500); await p.evaluate(() => bkPortfolioAddCurrent()); await p.waitForTimeout(300);
    await p.evaluate(() => { bkUndo(); }); await p.waitForTimeout(400); const a3 = await p.evaluate(() => { const o = document.getElementById('bk-undo-ask'); return o ? o.innerText : null; });
    check('Undo of "saved to the portfolio" warns that it removes a saved deal', !!a3 && /removes 1 saved deal/.test(a3), a3 && a3.replace(/\n/g, ' | ').slice(0, 160)); await p.context().close(); }
  { const p = await open(A, { purchasePrice: 19800000 }); await p.evaluate(() => showSheet('Home')); await p.waitForTimeout(500);
    await p.evaluate(() => { const s = bkLoad(); s.dealType = 'Development'; bkSave(s); }); await p.waitForTimeout(200); await p.evaluate(() => { bkUndo(); }); await p.waitForTimeout(400); const a4 = await p.evaluate(() => { const o = document.getElementById('bk-undo-ask'); return o ? o.innerText : null; });
    check('Undo of a deal-type change warns that the deal type changes', !!a4 && /deal type changes from Development to (Acquisition|blank)/.test(a4), a4 && a4.replace(/\n/g, ' | ').slice(0, 200)); await p.context().close(); }
  /* no deal open: Undo still works (a removed deal can be brought back) */
  { const p = await open(A, { purchasePrice: 19800000 }); await p.evaluate(() => showSheet('Home')); await p.waitForTimeout(500); const first = await snap(p);
    await p.evaluate(() => { localStorage.removeItem('bkcapital.cre.v02'); }); await p.waitForTimeout(250); const st = await state(p);
    check('removing the open deal is a step (labelled "Remove deal ...")', /Remove deal/.test(st.undo[st.undo.length - 1]), st.undo[st.undo.length - 1]);
    await p.evaluate(() => { bkUndo({ confirmed: true }); }); await p.waitForTimeout(300); check('and Undo brings it back exactly', await same(p, first)); await p.context().close(); }
  console.log('undo: ' + checks + ' checks, ' + fails + ' failures'); await b.close(); process.exit(fails ? 1 : 0);
})();
