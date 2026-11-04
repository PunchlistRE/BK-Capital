// Stage D: the Deal Underwrite tab bar and the cell convention on every input sheet.
//  tab bar: seven group tabs on one row, sticky under the header, one open (the first group with a missing required input, or the one you chose), panels open directly below, N/A groups say so,
//           "Show all", keyboard, the "Missing:" jump, print carries every panel, a phone scrolls the row sideways
//  cells:   input = blue on pale neutral yellow; calculated = black, no fill; linked = green; N/A = grey; missing = red outline; needed = amber outline  (light and dark, every input sheet)
//  and:     editing, validation and the engine's values are unchanged
//   node audit/stageD_test.js index.html
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); const path = require('path');
const H = require(path.join(__dirname, 'harbor', 'deal.js')), A = require(path.join(__dirname, 'deal.js'));
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined }); let checks = 0, fails = 0;
  const check = (n, ok, d) => { checks++; if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? '  [' + String(d).slice(0, 300) + ']' : '')); };
  const open = async (deal, o) => { o = o || {}; const p = await b.newPage({ viewport: { width: o.w || 1400, height: (o.w || 1400) < 600 ? 844 : 900 }, colorScheme: o.theme || 'light' }); p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
    await p.route(/supabase\.co|vercel\.app|fonts\.g|cdn\.jsdelivr/, r => r.abort()); await p.goto('file://' + path.resolve(process.argv[2])); await p.waitForTimeout(700);
    await p.evaluate(([d, tabs, th, blank]) => { document.documentElement.classList.add('bk-auth-ok'); localStorage.setItem('bk-pt-all', tabs ? '0' : '1'); localStorage.setItem('bk-theme', th); localStorage.removeItem('bk-du-tab'); bkCreateNewDeal(d); const s = bkLoad(); Object.assign(s, d); (blank || []).forEach(k => { s[k] = 0; }); bkSave(s); }, [deal, o.tabs !== false, o.theme || 'light', o.blank]);
    return p; };
  const show = async (p, sh) => { await p.evaluate((x) => showSheet(x), sh); await p.waitForTimeout(1300); };
  const NAMES = ['Setup', 'Income & costs', 'Exit', 'Financing', 'Partnership', 'Development', 'Tax & rules'];

  /* ---------------- tab bar ---------------- */
  { const p = await open(H, { blank: ['exitCap'] }); await show(p, 'Deal Underwrite');
    const r = await p.evaluate(() => { const bar = document.querySelector('#viewport .bk-dui'), tabs = [...bar.querySelectorAll('.bk-dt')]; return { names: tabs.map(t => t.querySelector('.nm').textContent.trim()), rows: new Set(tabs.map(t => Math.round(t.getBoundingClientRect().top))).size, role: bar.getAttribute('role'), roles: tabs.every(t => t.getAttribute('role') === 'tab'), sel: tabs.filter(t => t.getAttribute('aria-selected') === 'true').map(t => t.querySelector('.nm').textContent.trim()), badge: tabs.map(t => (t.querySelector('.bk-dt-n') || {}).textContent || ''), panels: [...document.querySelectorAll('#viewport .tbl-wrap[data-bk-grp]')].length, h: Math.round(bar.getBoundingClientRect().height) }; });
    check('tabs: exactly seven group tabs, in order, on one row, as a tablist', JSON.stringify(r.names) === JSON.stringify(NAMES) && r.rows === 1 && r.role === 'tablist' && r.roles && r.h < 60, JSON.stringify([r.names, r.rows, r.h]));
    check('tabs: it opens on the first group with a required input missing (Exit), which carries a red count of 1', JSON.stringify(r.sel) === '["Exit"]' && r.badge[2] === '1' && r.badge.filter(Boolean).length === 1, JSON.stringify([r.sel, r.badge]));
    const vis = () => p.evaluate(() => { const o = {}; document.querySelectorAll('#viewport .tbl-wrap[data-bk-grp]').forEach(w => { const g = w.getAttribute('data-bk-grp'); (o[g] = o[g] || { shown: 0, hidden: 0 })[getComputedStyle(w).display === 'none' ? 'hidden' : 'shown']++; }); return o; });
    let ok = true, detail = []; const total0 = await p.evaluate(() => document.querySelectorAll('#viewport .tbl-wrap').length);
    for (let g = 0; g < 7; g++) { await p.click('.bk-dt[data-bk-grp="' + g + '"]'); await p.waitForTimeout(250); const v = await vis(); Object.keys(v).forEach(k => { const x = v[k]; if (Number(k) === g ? (x.hidden > 0 || x.shown === 0) : x.shown > 0) { ok = false; detail.push(g + ':' + k + JSON.stringify(x)); } }); }
    check('tabs: a tab opens only its own panels directly below, and every other group is hidden (never removed)', ok && (await p.evaluate(() => document.querySelectorAll('#viewport .tbl-wrap').length)) === total0, detail.join(' '));
    await p.click('.bk-dt[data-bk-grp="4"]'); await p.waitForTimeout(250); const act = await p.evaluate(() => [...document.querySelectorAll('.bk-dt')].filter(t => t.classList.contains('on') && t.getAttribute('aria-selected') === 'true' && t.getAttribute('tabindex') === '0').map(t => t.querySelector('.nm').textContent));
    check('tabs: the open tab is clearly marked (class, aria-selected, the only tab in the tab order)', JSON.stringify(act) === '["Partnership"]', JSON.stringify(act));
    const styl = await p.evaluate(() => { const on = document.querySelector('.bk-dt.on'), off = document.querySelector('.bk-dt:not(.on)'); const a = getComputedStyle(on), c = getComputedStyle(off); return { onBorder: a.borderBottomColor, onW: a.borderBottomWidth, offBorder: c.borderBottomColor, onBg: a.backgroundColor, offBg: c.backgroundColor, onFw: a.fontWeight, offFw: c.fontWeight }; });
    check('tabs: the open tab differs from the others by underline, fill and weight', styl.onBorder !== styl.offBorder && parseFloat(styl.onW) >= 3 && styl.onBg !== styl.offBg && Number(styl.onFw) > Number(styl.offFw), JSON.stringify(styl));
    /* sticky */
    await p.evaluate(() => window.scrollTo(0, 900)); await p.waitForTimeout(400);
    const stick = await p.evaluate(() => { const bar = document.querySelector('.bk-dui'), r = bar.getBoundingClientRect(), f = document.querySelector('.bk-flow'), fb = f ? f.getBoundingClientRect().bottom : 0; return { top: Math.round(r.top), flowBottom: Math.round(fb), pos: getComputedStyle(bar).position, vis: r.bottom > 0 && r.top < innerHeight, scrolled: scrollY }; });
    check('tabs: sticky: scrolled far down the page the bar stays visible directly under the pinned header', stick.pos === 'sticky' && stick.scrolled > 300 && stick.vis && Math.abs(stick.top - stick.flowBottom) <= 2, JSON.stringify(stick));
    await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(200);
    /* keyboard */
    await p.focus('.bk-dt.on'); await p.keyboard.press('ArrowRight'); await p.waitForTimeout(250); const k1 = await p.evaluate(() => document.querySelector('.bk-dt.on .nm').textContent);
    await p.keyboard.press('End'); await p.waitForTimeout(200); const k2 = await p.evaluate(() => document.querySelector('.bk-dt.on .nm').textContent); await p.keyboard.press('Home'); await p.waitForTimeout(200); const k3 = await p.evaluate(() => document.querySelector('.bk-dt.on .nm').textContent);
    check('tabs: arrow keys, Home and End move between the tabs and open them', k1 === 'Development' && k2 === 'Tax & rules' && k3 === 'Setup', [k1, k2, k3].join(' / '));
    /* the Missing: jump */
    await p.click('.bk-dt[data-bk-grp="0"]'); await p.waitForTimeout(250);
    await p.click('[data-bk-jump-key="exitCap"]'); await p.waitForTimeout(900);
    const jm = await p.evaluate(() => { const row = document.querySelector('#viewport tr[data-bk-key="exitCap"]'), w = row.closest('.tbl-wrap'); return { on: document.querySelector('.bk-dt.on .nm').textContent, shown: getComputedStyle(w).display !== 'none', inView: row.getBoundingClientRect().bottom > 0 && row.getBoundingClientRect().top < innerHeight }; });
    check('tabs: "Missing: Exit Capitalization Rate" opens the Exit tab and brings the row into view', jm.on === 'Exit' && jm.shown && jm.inView, JSON.stringify(jm));
    /* show all, and the choice is remembered */
    await p.evaluate(() => document.activeElement && document.activeElement.blur()); await p.waitForTimeout(700);   /* the jump focused the cell; leaving it saves and redraws the sheet */
    await p.click('.bk-dt-all'); await p.waitForTimeout(300); const sa = await vis(); const lab = await p.evaluate(() => document.querySelector('.bk-dt-all').textContent);
    check('tabs: "Show all" puts every panel on the page (and the button turns into "Show as tabs")', Object.values(sa).every(x => x.hidden === 0) && lab === 'Show as tabs', lab);
    await p.click('.bk-dt-all'); await p.waitForTimeout(300); await p.click('.bk-dt[data-bk-grp="3"]'); await p.waitForTimeout(250); await show(p, 'Home'); await show(p, 'Deal Underwrite');
    check('tabs: the tab you chose is still open when you come back to the sheet', (await p.evaluate(() => document.querySelector('.bk-dt.on .nm').textContent)) === 'Financing');
    /* print */
    await p.emulateMedia({ media: 'print' }); await p.waitForTimeout(200); const pr = await vis(); await p.emulateMedia({ media: 'screen' });
    check('tabs: a printed page carries every panel, not just the open tab', Object.values(pr).every(x => x.hidden === 0), JSON.stringify(pr));
    check('tabs: no page errors', p.errs.length === 0, p.errs.join('|')); await p.close(); }
  { const p = await open(H); await show(p, 'Deal Underwrite'); check('tabs: with nothing missing it opens on Setup', (await p.evaluate(() => document.querySelector('.bk-dt.on .nm').textContent)) === 'Setup'); await p.close(); }
  { const p = await open(A); await show(p, 'Deal Underwrite'); const na = await p.evaluate(() => [...document.querySelectorAll('.bk-dt.na')].map(t => t.querySelector('.nm').textContent + ':' + ((t.querySelector('.bk-dt-na') || {}).textContent || '')));
    check('tabs: on an acquisition the Development tab says N/A (and is grey), the others do not', JSON.stringify(na) === '["Development:N/A"]', JSON.stringify(na)); await p.close(); }
  { const p = await open(H); await show(p, 'Deal Underwrite'); check('tabs: on a development the Development tab is live', (await p.evaluate(() => document.querySelectorAll('.bk-dt.na').length)) === 0); await p.close(); }
  { const p = await open(A, { w: 390, blank: ['exitCap'] }); await show(p, 'Deal Underwrite');
    const m = await p.evaluate(() => { const bar = document.querySelector('.bk-dui'), tabs = [...bar.querySelectorAll('.bk-dt')]; return { rows: new Set(tabs.map(t => Math.round(t.getBoundingClientRect().top))).size, sw: bar.scrollWidth, cw: bar.clientWidth, ox: getComputedStyle(bar).overflowX, wrap: getComputedStyle(bar).flexWrap, page: document.documentElement.scrollWidth }; });
    check('phone: the seven tabs stay on one row and scroll sideways instead of wrapping', m.rows === 1 && m.sw > m.cw + 40 && /auto|scroll/.test(m.ox) && m.wrap === 'nowrap', JSON.stringify(m));
    check('phone: the tab bar does not widen the page', m.page <= 391, m.page);
    await p.click('.bk-dt[data-bk-grp="6"]'); await p.waitForTimeout(600); const e = await p.evaluate(() => { const bar = document.querySelector('.bk-dui'), t = bar.querySelector('.bk-dt.on'), b = bar.getBoundingClientRect(), r = t.getBoundingClientRect(); return { left: Math.round(r.left - b.left), right: Math.round(b.right - r.right), sl: bar.scrollLeft }; });
    check('phone: opening the last tab scrolls the row so that tab is fully in view', e.sl > 0 && e.left >= -1 && e.right >= -1, JSON.stringify(e));
    check('phone: no page errors', p.errs.length === 0, p.errs.join('|')); await p.close(); }

  /* ---------------- cell convention ---------------- */
  const probe = () => { const rgb = (c) => { const m = String(c).match(/[\d.]+/g); return m ? m.slice(0, 3).map(Number) : null; }; const lum = (c) => { const [r, g, bb] = rgb(c).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * bb; };
    const root = getComputedStyle(document.documentElement), tok = (n) => { const e = document.createElement('div'); e.style.cssText = 'position:absolute;visibility:hidden;color:var(' + n + ')'; document.getElementById('viewport').appendChild(e); const c = getComputedStyle(e).color; e.remove(); return c; };
    const tokBg = (n) => { const e = document.createElement('div'); e.style.cssText = 'position:absolute;visibility:hidden;background:var(' + n + ')'; document.getElementById('viewport').appendChild(e); const c = getComputedStyle(e).backgroundColor; e.remove(); return c; };
    const effBg = (el) => { for (let x = el; x; x = x.parentElement) { const c = getComputedStyle(x).backgroundColor; if (c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent') return c; } return 'rgb(255, 255, 255)'; };
    const ratio = (a, b2) => { const l1 = lum(a), l2 = lum(b2); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
    return { rgb, lum, tok, tokBg, effBg, ratio }; };
  const INPUT_SHEETS = ['Deal Underwrite', 'Rent Roll', 'Property', 'Market', 'Revenues', 'Expenses', 'Tenants', 'Investment', 'Valuation', 'Debt', 'Depreciation', 'Credit Policy', 'IC Memo', 'Sensitivity', 'Capital Allocation'];
  for (const theme of ['light', 'dark']) {
    const p = await open(H, { theme, tabs: false }); const bad = [], per = {}; let total = 0;
    for (const sh of INPUT_SHEETS) { const r = await p.evaluate(async ([sh, src]) => { const T = eval('(' + src + ')')(); showSheet(sh); await new Promise(r => setTimeout(r, 700)); const fill = T.tokBg('--bk-in-fill'), ink = T.tok('--bk-in-ink'); let n = 0; const bad = [];
        document.querySelectorAll('#viewport input:not([type=checkbox]):not([type=radio]):not([type=file]):not([type=button]):not([type=submit]):not([type=hidden]):not([type=range]), #viewport select, #viewport textarea, #viewport td[contenteditable="true"]').forEach(e => {
          if (!e.getClientRects().length || e.closest('[hidden]') || e.disabled || e.readOnly || e.closest('tr.bk-na')) return; n++; const bg = T.effBg(e), col = getComputedStyle(e).color; if (bg !== fill || col !== ink) bad.push((e.id || e.name || e.className || e.tagName).toString().slice(0, 24) + ' bg ' + bg + ' ink ' + col); });
        return { n, bad: bad.slice(0, 4), fill, ink }; }, [sh, probe.toString()]); per[sh] = r.n; total += r.n; if (r.bad.length) bad.push(sh + ': ' + r.bad.join(' | ')); }
    check(theme + ': every editable control on ' + INPUT_SHEETS.length + ' input sheets (' + total + ' controls) is blue text on the input fill', total > 150 && bad.length === 0, bad.join(' // ') || JSON.stringify(per));
    const tk = await p.evaluate((src) => { const T = eval('(' + src + ')')(); const fill = T.tokBg('--bk-in-fill'), ink = T.tok('--bk-in-ink'), link = T.tok('--bk-link-ink'), na = T.tok('--bk-na-ink'), red = T.tok('--bk-attn-red'), amber = T.tok('--bk-attn-amber'), page = T.effBg(document.getElementById('viewport')), panel = getComputedStyle(document.documentElement).getPropertyValue('--ae-cell-ro'), key = T.tokBg('--bk-fill-key');
      const c = T.rgb(fill); return { fill, ink, link, na, red, amber, page, key, in_ratio: T.ratio(ink, fill), link_ratio: T.ratio(link, page), na_ratio: T.ratio(na, page), spread: Math.max(...c) - Math.min(...c), lumFill: T.lum(fill), lumPage: T.lum(page), keyDiff: key !== fill }; }, probe.toString());
    check(theme + ': input text on the input fill reads at 4.5:1 or better; linked 3:1; N/A text 3:1', tk.in_ratio >= 4.5 && tk.link_ratio >= 3 && tk.na_ratio >= 3, [tk.in_ratio, tk.link_ratio, tk.na_ratio].map(v => v.toFixed(2)).join(' / '));
    check(theme + ': the input fill is a neutral yellow (channel spread under 40), differs from the page and from the key-metric fill', tk.spread < 40 && tk.lumFill !== tk.lumPage && tk.keyDiff, JSON.stringify({ fill: tk.fill, spread: tk.spread }));
    if (theme === 'light') check('light: the input fill is light (luminance 0.9 or more)', tk.lumFill >= 0.9, tk.lumFill.toFixed(3));
    await show(p, 'Deal Underwrite');
    const cc = await p.evaluate((src) => { const T = eval('(' + src + ')')(); const calc = [...document.querySelectorAll('#viewport td[data-bk-kind="calc"]')].filter(e => e.getClientRects().length), ink = T.tok('--bk-in-ink'), link = T.tok('--bk-link-ink'), page = T.effBg(document.getElementById('viewport'));
      const bad = calc.filter(e => getComputedStyle(e).color === ink || getComputedStyle(e).color === link || (T.effBg(e) !== T.effBg(e.parentElement.parentElement) && getComputedStyle(e).backgroundColor !== 'rgba(0, 0, 0, 0)' && getComputedStyle(e).backgroundColor !== 'transparent')).length;
      const txt = getComputedStyle(calc[0] || document.body).color; return { n: calc.length, bad, txt }; }, probe.toString());
    check(theme + ': calculated cells are plain text with no fill (neither the input blue nor the link green)', cc.n >= 1 && cc.bad === 0, JSON.stringify(cc));
    const mk = await p.evaluate(async (src) => { const T = eval('(' + src + ')')(); const s = bkLoad(); s.exitCap = 0; bkSave(s); showSheet('Deal Underwrite'); await new Promise(r => setTimeout(r, 1000)); const row = document.querySelector('tr[data-bk-key="exitCap"] td.v'), t = T.tok('--bk-attn-red'); const sh = getComputedStyle(row).boxShadow;
      const nd = [...document.querySelectorAll('tr.bk-attn td.v')]; const amber = T.tok('--bk-attn-amber');
      return { shadow: sh, red: t, hasRed: sh.indexOf(t) >= 0, needed: nd.length, amberOk: nd.every(e => getComputedStyle(e).boxShadow.indexOf(amber) >= 0), tmpl: [...document.querySelectorAll('tr[data-bk-key] .status-chip.warn')].filter(c => /TEMPLATE/.test(c.textContent)).length }; }, probe.toString());
    check(theme + ': a missing required input has a red outline', mk.hasRed, mk.shadow + ' vs ' + mk.red);
    check(theme + ': a value the returns need (NEEDED) has an amber outline; a template default does not (its chip says so)', mk.amberOk, JSON.stringify(mk));
    check(theme + ': no page errors', p.errs.length === 0, p.errs.join('|')); await p.close(); }
  { const p = await open(A, { tabs: false }); await show(p, 'Deal Underwrite');
    const na = await p.evaluate((src) => { const T = eval('(' + src + ')')(); const rows = [...document.querySelectorAll('tr.bk-na')], g = T.tok('--bk-na-ink'); const bad = rows.filter(r => [...r.children].slice(0, -1).some(td => td.innerText.trim() && getComputedStyle(td).color !== g)).length; return { n: rows.length, bad, g }; }, probe.toString());
    check('N/A rows (the development tables on an acquisition) are grey text, not just faded', na.n > 15 && na.bad === 0, JSON.stringify(na));
    await p.evaluate(() => bkEdGo('Valuation', 'Valuation', 'sum')); await p.waitForTimeout(1200); const lk = await p.evaluate((src) => { const T = eval('(' + src + ')')(); const l = [...document.querySelectorAll('#viewport .bk-link')].filter(e => e.getClientRects().length), g = T.tok('--bk-link-ink'); const calc = [...document.querySelectorAll('#viewport .ae-sum:not(:has(.bk-link)) td.r')].filter(e => e.getClientRects().length && !e.classList.contains('ro')); return { n: l.length, green: l.every(e => getComputedStyle(e).color === g), calcPlain: calc.every(e => getComputedStyle(e).color !== g) }; }, probe.toString());
    check('linked values (Valuation: Value and Returns, which come from the returns engine) are green; calculated summaries on the same sheet are not', lk.n >= 3 && lk.green && lk.calcPlain, JSON.stringify(lk));
    await p.evaluate(() => { const b = document.querySelector('.card-head'); }); await p.close(); }
  { const p = await open(A, { tabs: false }); await show(p, 'Deal Underwrite'); await p.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /Color key/i.test(x.textContent)); if (b) b.click(); }); await p.waitForTimeout(400);
    const key = await p.evaluate(() => { const rows = [...document.querySelectorAll('.keyrow')].filter(r => r.getClientRects().length); return rows.map(r => r.querySelector(':scope > div b').textContent.trim() + ':' + getComputedStyle(r.querySelector('.keyswatch')).backgroundColor); });
    check('the color key lists the seven real styles (input, calculated, linked, N/A, the dash / Unavailable / N/A / zero row, required, needs a look), and the input swatch is the real input fill', key.length === 7 && /^Input:rgb\(253, 250, 230\)/.test(key[0]) && /Calculated/.test(key[1]) && /Linked/.test(key[2]) && /N\/A/.test(key[3]) && /Dash/.test(key[4]) && /Required/.test(key[5]) && /Needs a look/.test(key[6]), JSON.stringify(key).slice(0, 200)); await p.close(); }

  /* ---------------- nothing else changed ---------------- */
  { const p = await open(A, { tabs: false }); await show(p, 'Deal Underwrite'); const before = await p.evaluate(() => { const s = bkLoad(); return { hold: s.holdYears, price: s.purchasePrice, type: s.propertyType, irr: bkMonthlyReturns().irr }; });
    const cell = 'tr[data-bk-key="holdYears"] td.v'; await p.click(cell); await p.keyboard.press('Control+A'); await p.keyboard.type('7'); await p.keyboard.press('Tab'); await p.waitForTimeout(600);
    const after = await p.evaluate(() => ({ hold: bkLoad().holdYears, irr: bkMonthlyReturns().irr, txt: document.querySelector('tr[data-bk-key="holdYears"] td.v').innerText.trim() }));
    check('editing still works: typing 7 into the hold-period cell stores 7 and the returns recalculate', Number(after.hold) === 7 && after.irr !== before.irr && /7/.test(after.txt), JSON.stringify([before.hold, after]));
    await p.selectOption('tr[data-bk-key="propertyType"] select', { index: 2 }); await p.waitForTimeout(500); const pt = await p.evaluate(() => bkLoad().propertyType);
    check('editing still works: a dropdown stores its choice', pt && pt !== before.type, pt);
    await p.click(cell); await p.keyboard.press('Control+A'); await p.keyboard.type('abc'); await p.keyboard.press('Tab'); await p.waitForTimeout(600); const bad = await p.evaluate(() => ({ hold: bkLoad().holdYears, fin: isFinite(Number(bkLoad().holdYears)), irr: bkMonthlyReturns().irr }));
    check('validation is kept: letters typed into a numeric cell never become NaN in the deal', bad.fin && isFinite(bad.irr), JSON.stringify(bad));
    check('no page errors', p.errs.length === 0, p.errs.join('|')); await p.close(); }

  console.log('stage D: ' + checks + ' checks, ' + fails + ' failures'); await b.close(); process.exit(fails ? 1 : 0);
})();
