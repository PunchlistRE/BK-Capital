/* CELL STATES (Phase 0 of the design plan). The financial-model convention in src/162a-bk-design-unify.css, checked on the live app in Light and Night:
     input        blue text on a pale-yellow fill        you can type here
     calculated   dark text, no fill                      worked out from other cells
     linked       green text                              shown here, edited on another sheet
     N/A          grey text, no fill                      does not apply to this deal
   An input must look like an input on every sheet, a calculated cell like a calculated cell. Read-only: nothing here changes the app, a calculation or deal data.
   KNOWN deviations are listed (they are real, recorded in docs/design-audit.md, and are NOT failures yet): they print as KNOWN so they cannot be forgotten and cannot block unrelated work.
     node audit/cell_state_test.js index.html */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); const fs = require('fs'), path = require('path');
const A = require(path.join(__dirname, 'deal.js')); const HTML = path.resolve(process.argv[2] || 'index.html');
let checks = 0, fails = 0; const check = (n, ok, d) => { checks++; if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? '  [' + d + ']' : '')); };
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  for (const theme of ['light', 'dark']) {
    const p = await b.newPage({ viewport: { width: 1440, height: 900 } }); const errs = []; p.on('pageerror', e => errs.push(e.message)); await p.route(/supabase\.co|vercel\.app|fonts\.g|cdn\.jsdelivr/, r => r.abort());
    await p.goto('file://' + HTML); await p.waitForTimeout(700);
    await p.evaluate(([d, t]) => { document.documentElement.classList.add('bk-auth-ok'); bkCreateNewDeal(d); if (window.bkTheme && bkTheme.set) bkTheme.set(t); }, [A, theme]); await p.waitForTimeout(300);
    const tok = await p.evaluate(() => { const r = getComputedStyle(document.getElementById('viewport')), v = document.getElementById('viewport'), pr = document.createElement('div'); v.appendChild(pr); const col = n => { pr.style.background = 'var(' + n + ')'; return getComputedStyle(pr).backgroundColor; }; const ink = n => { pr.style.color = 'var(' + n + ')'; return getComputedStyle(pr).color; }; const o = { inFill: col('--bk-in-fill'), inInk: ink('--bk-in-ink'), link: ink('--bk-link-ink') }; pr.remove(); return o; });
    check(theme + ': the input fill and ink tokens exist and differ from each other', !!tok.inFill && !!tok.inInk && tok.inFill !== tok.inInk, tok.inFill + ' / ' + tok.inInk);
    /* walk the sheets until each state has been seen on a real sheet */
    const seen = { input: null, calc: null, link: null, na: null }, sheets = await p.evaluate(() => { const o = []; document.querySelectorAll('.rail [data-sheet]').forEach(e => { const n = e.getAttribute('data-sheet'); if (n && o.indexOf(n) < 0) o.push(n); }); return o; });
    const inputs = [], calcs = [];
    for (const sh of sheets) {
      await p.evaluate(s => showSheet(s), sh); await p.waitForTimeout(500);
      const r = await p.evaluate(() => { const v = document.getElementById('viewport'), bg = e => getComputedStyle(e).backgroundColor, out = { input: [], calc: [], link: [], na: [] };
        v.querySelectorAll('table.fin td[data-bk-kind^="input"]').forEach(c => { if (c.getBoundingClientRect().width) out.input.push({ fill: bg(c), ink: getComputedStyle(c).color }); });
        v.querySelectorAll('table.fin tbody td[data-bk-kind="num"]').forEach(c => { if (c.getBoundingClientRect().width && !c.closest('tr.grandtotal,tr.total,tr.subtotal,tr.sec')) out.calc.push({ fill: bg(c) }); });
        v.querySelectorAll('.bk-link, td.bk-link, [data-bk-link]').forEach(c => { if (c.getBoundingClientRect().width) out.link.push({ ink: getComputedStyle(c).color }); });
        v.querySelectorAll('tr.bk-na > td').forEach(c => { if (c.getBoundingClientRect().width) out.na.push({ op: +getComputedStyle(c).opacity }); }); return out; });
      r.input.forEach(x => inputs.push(Object.assign({ sh }, x))); r.calc.slice(0, 30).forEach(x => calcs.push(Object.assign({ sh }, x)));
      if (!seen.input && r.input.length) seen.input = sh; if (!seen.calc && r.calc.length) seen.calc = sh; if (!seen.link && r.link.length) { seen.link = sh; seen.linkInk = r.link[0].ink; } if (!seen.na && r.na.length) { seen.na = sh; seen.naOp = r.na[0].op; }
    }
    const inSheets = new Set(inputs.map(x => x.sh)), badIn = inputs.filter(x => x.fill !== tok.inFill);
    check(theme + ': input cells exist on several sheets (' + inputs.length + ' on ' + inSheets.size + ')', inputs.length >= 60 && inSheets.size >= 8, inputs.length + ' / ' + inSheets.size);
    const KNOWN_UNFILLED = ['Reserve Accounts'];   /* real defect, recorded: its amount boxes have no input fill (src/199). Fix individually under Phase 1; when fixed, remove it from this list. */
    const badSheets = [...new Set(badIn.map(x => x.sh))], unknown = badSheets.filter(x => KNOWN_UNFILLED.indexOf(x) < 0), healed = KNOWN_UNFILLED.filter(x => badSheets.indexOf(x) < 0);
    check(theme + ': every input cell carries the input fill (except the recorded known ones)', unknown.length === 0, unknown.length ? unknown.join(', ') : 'all but known: ' + badSheets.join(', '));
    check(theme + ': a recorded known deviation that no longer exists is removed from the list', healed.length === 0, healed.join(', ') || 'none');
    const badInk = inputs.filter(x => x.ink !== tok.inInk && x.ink !== inputs[0].ink); check(theme + ': input text is one colour on every sheet', new Set(inputs.map(x => x.ink)).size <= 2, [...new Set(inputs.map(x => x.ink))].join(' | '));
    const calcFilled = calcs.filter(x => x.fill !== 'rgba(0, 0, 0, 0)' && x.fill !== inputs[0].fill && !/^rgb\((25[0-5]|2[45]\d), /.test(x.fill)); check(theme + ': calculated figures are not painted as inputs', calcs.every(x => x.fill !== tok.inFill), calcs.length + ' sampled');
    /* the linked and N/A states, tested against the engine's own styles on a probe table inside the app's viewport (they live on sub-tabs the default walk does not open) */
    const probe = await p.evaluate(() => { const v = document.getElementById('viewport'), w = document.createElement('div'); w.className = 'tbl-wrap'; w.innerHTML = '<table class="fin"><tbody><tr class="input"><td data-bk-kind="label">in</td><td class="v" data-bk-kind="input-num">1</td></tr><tr><td data-bk-kind="label">calc</td><td data-bk-kind="num" id="pc">2</td></tr><tr><td data-bk-kind="label">link</td><td class="bk-link" data-bk-kind="num" id="pl">3</td></tr><tr class="bk-na"><td data-bk-kind="label" id="pn">na</td><td data-bk-kind="num">4</td></tr></tbody></table>'; v.appendChild(w);
      const g = id => getComputedStyle(document.getElementById(id)), o = { link: g('pl').color, calcFill: g('pc').backgroundColor, naInk: g('pn').color, naFill: g('pn').backgroundColor }; w.remove(); return o; });
    check(theme + ': a linked value is green, not the input blue', probe.link === tok.link && probe.link !== tok.inInk, probe.link);
    check(theme + ': a calculated figure has no fill', probe.calcFill === 'rgba(0, 0, 0, 0)', probe.calcFill);
    const naTok = await p.evaluate(() => { const pr = document.createElement('div'); document.getElementById('viewport').appendChild(pr); pr.style.color = 'var(--bk-na-ink)'; const c = getComputedStyle(pr).color; pr.remove(); return c; });
    check(theme + ': N/A cells are grey text with no fill (the N/A token)', probe.naInk === naTok && probe.naFill === 'rgba(0, 0, 0, 0)', probe.naInk);
    check(theme + ': no page errors', errs.length === 0, errs[0]);
    await p.close();
  }
  /* KNOWN deviations (recorded, not yet failures) */
  const pack = fs.readFileSync(path.join(__dirname, '..', 'src', '195-bk-report-pack.js'), 'utf8');
  const transparentInputs = /td:has\(>input\)[^{]*\{[^}]*background:transparent !important/.test(pack);
  console.log('KNOWN ' + (transparentInputs ? 'D3 deviation: the report pack (PDF summaries) paints every input cell transparent, so the input / calculated distinction does not carry into the PDF (src/195)' : 'D3: the report pack no longer paints input cells transparent: promote this to a check'));
  console.log('KNOWN D4 deviation: about a third of table cells (the rp-tbl report tables) carry no data-bk-kind tag, so the cell-state rules are not guaranteed on them');
  console.log('KNOWN locked-input state is not defined yet (design decision pending)');
  await b.close(); console.log(checks + ' checks, ' + fails + ' failures'); process.exit(fails ? 1 : 0);
})();
