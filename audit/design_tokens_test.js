/* Design-system ratchet: the engine must never grow new hard-coded colours, font sizes or radii. New styling uses the --ds-* tokens (src/007-style.css, docs/design-system.html).
   The counts may only go DOWN. When an area is moved onto the tokens, lower the baseline in audit/design_tokens_baseline.json to the new count. */
const fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..'), src = path.join(root, 'src');
const files = fs.readdirSync(src).filter(f => /\.(css|js)$/.test(f) && f !== '007-style.css');   /* 007 is the palette itself: the one file where colours are defined */
const text = files.map(f => fs.readFileSync(path.join(src, f), 'utf8')).join('\n');
const uniq = (re, norm) => new Set((text.match(re) || []).map(norm)).size;
const now = { colors: uniq(/#[0-9a-fA-F]{6}\b/g, x => x.toLowerCase()), fontSizes: uniq(/font-size:\s*[0-9.]+px/g, x => x.replace(/\s/g, '')), radii: uniq(/border-radius:\s*[0-9.]+px/g, x => x.replace(/\s/g, '')) };
const base = JSON.parse(fs.readFileSync(path.join(__dirname, 'design_tokens_baseline.json'), 'utf8'));
let fails = 0, checks = 0;
const ok = (name, cond, extra) => { checks++; if(!cond) fails++; console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); };
Object.keys(base).forEach(k => ok('distinct ' + k + ' (' + now[k] + ') does not exceed the baseline (' + base[k] + ')' + (now[k] < base[k] ? ' - lower the baseline to ' + now[k] : ''), now[k] <= base[k]));
const css = fs.readFileSync(path.join(src, '007-style.css'), 'utf8');
const names = [...new Set((css.match(/--ds-[a-z0-9-]+(?=:)/g) || []))];
ok('the design-system tokens are defined (' + names.length + ')', names.length >= 28);
const dark = ['--ds-accent', '--ds-pos', '--ds-neg', '--ds-warn', '--ds-bar'].every(n => (css.match(new RegExp(n + ':', 'g')) || []).length >= 3);
ok('every colour token has a Night value in both Night blocks', dark);
ok('the design-system reference page exists', fs.existsSync(path.join(root, 'docs', 'design-system.html')));
console.log(checks + ' checks, ' + fails + ' failures');
process.exit(fails ? 1 : 0);
