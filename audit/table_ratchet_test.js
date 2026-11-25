/* TABLE RATCHET (design-system phase 1). Locks in what phase 1 removed from the screen, so the old layers cannot creep back. Reads every stylesheet in src/,
   leaves out comments, print-only blocks and the rules kept for printing (scoped to html.bk-printing and marked print-legacy, so printed pages stay as they were until phase 5), and checks:
   (1) no rule sizes the columns of a financial table by position (nth-child + width) - widths come from the table standard (src/111 + src/209);
   (2) no rule keys on the column-count classes (bk-grid3/4, bk-tt2-4, bk-vt2-4), which now feed print only;
   (3) status labels are styled in one place (src/209), apart from the app-wide bases and five single, named rules that agree with it;
   (4) the screen-active !important count does not rise above phase 1's level (main had 913);
   and it reports how many print-legacy blocks phase 5 has to remove.  Static: no browser.   node audit/table_ratchet_test.js */
const fs = require('fs'), path = require('path'); const SRC = path.join(__dirname, '..', 'src');
let checks = 0, fails = 0; const check = (n, ok, d) => { checks++; if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? '  [' + String(d).slice(0, 400) + ']' : '')); };
function strip(c) { let o = '', i = 0; while (i < c.length) { const m = /@media\s+([^{]*)\{/g; m.lastIndex = i; const r = m.exec(c); if (!r) { o += c.slice(i); break; } o += c.slice(i, r.index);
  let d = 1, j = r.index + r[0].length; while (j < c.length && d > 0) { if (c[j] === '{') d++; else if (c[j] === '}') d--; j++; } const inner = c.slice(r.index + r[0].length, j - 1);
  if (/\bprint\b/.test(r[1]) && !/\bscreen\b/.test(r[1])) { i = j; continue; } o += '@media ' + r[1] + '{' + strip(inner) + '}'; i = j; } return o; }
const rules = css => { const o = []; const re = /([^{};]+)\{([^{}]*)\}/g; let m; while ((m = re.exec(css))) o.push({ sel: m[1].trim(), body: m[2] }); return o; };
/* app-wide bases (outside the sheet area too) and single rules that agree with the standard: where a status label sits or wraps, never its colour or size */
const CHIP_ALLOWED = { '007-style.css': 5, '162-bk-v29340-institutional.css': 5, '108-bk-v302-responsive-system.css': 1, '123-bk-ux-workflow-css.css': 1, '162a-bk-design-unify.css': 1, '182-bk-palette.css': 1, '186-bk-review-polish.css': 1, '209-bk-table-standard.css': 99 };
const IMPORTANT_CEILING = 778, IMPORTANT_MAIN = 913;
let imp = 0, legacy = 0; const pos = [], cnt = [], chip = {};
fs.readdirSync(SRC).filter(f => /\.css$/.test(f)).forEach(f => { const raw = fs.readFileSync(path.join(SRC, f), 'utf8'); legacy += (raw.match(/print-legacy \(design-system phase 1\)/g) || []).length;
  const s = strip(raw.replace(/\/\*[\s\S]*?\*\//g, ''));
  rules(s).filter(r => !/where\((html)?\.bk-printing\)/.test(r.sel)).forEach(r => { imp += (r.body.match(/!important/g) || []).length; if (/\.fin\b/.test(r.sel) && /nth-child\(/.test(r.sel) && /(^|;|\s)width\s*:/.test(r.body) && !/\.rp\b|rp-tbl|ae-grid|ae-sum|gd-su|bk-m-stack/.test(r.sel)) pos.push(f + ': ' + r.sel.slice(0, 90));
    if (/bk-(grid|tt|vt)[0-9]/.test(r.sel)) cnt.push(f + ': ' + r.sel.slice(0, 90)); if (/\.status-chip/.test(r.sel)) chip[f] = (chip[f] || 0) + 1; }); });
check('no screen rule sizes a financial table\'s columns by position (main had 57)', pos.length === 0, pos.slice(0, 4).join(' ; '));
check('no screen rule keys on the column-count classes (main had 61)', cnt.length === 0, cnt.slice(0, 4).join(' ; '));
const extra = Object.keys(chip).filter(f => chip[f] > (CHIP_ALLOWED[f] || 0)).map(f => f + ' ' + chip[f]);
check('status labels are styled in one place (src/209) apart from the named bases and rules (main: 10 stylesheets, 61 rules)', extra.length === 0, extra.join(' ; '));
check('screen-active !important count is at most ' + IMPORTANT_CEILING + ' (main had ' + IMPORTANT_MAIN + ')', imp <= IMPORTANT_CEILING, imp);
console.log('INFO print-legacy blocks for phase 5 to remove: ' + legacy);
console.log('table ratchet: ' + checks + ' checks, ' + fails + ' failures'); process.exit(fails ? 1 : 0);
