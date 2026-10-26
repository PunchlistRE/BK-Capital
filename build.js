#!/usr/bin/env node
/* Assembles index.html from src/. Each manifest entry is one file wrapped in its original open/close tags
   (markup entries have none). Edit src/*, then run `node build.js`; `node build.js --check` fails if index.html is stale. */
const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, 'src');
const man = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
const out = man.map(e => e.open + fs.readFileSync(path.join(dir, e.file), 'utf8') + e.close).join('');
const target = path.join(__dirname, 'index.html');
if (process.argv.includes('--lint')) {
  /* every script part must compile, every style part must have balanced braces, ids must be unique, and every file in src/ must be in the manifest */
  const vm = require('vm'); let bad = 0; const ids = {}, listed = new Set(man.map(e => e.file));
  fs.readdirSync(dir).filter(f => /\.(js|css|html)$/.test(f)).forEach(f => { if (!listed.has(f)) { console.error('not in manifest: ' + f); bad++; } });
  man.forEach(e => {
    const src = fs.readFileSync(path.join(dir, e.file), 'utf8'), id = (/\bid="([^"]+)"/.exec(e.open) || [])[1];
    if (id) { if (ids[id]) { console.error('duplicate id ' + id + ' (' + e.file + ')'); bad++; } ids[id] = 1; }
    if (/\.js$/.test(e.file) && /^\s*<script\b(?![^>]*type="(?!text\/javascript))/.test(e.open)) { try { new vm.Script(src, { filename: e.file }); } catch (x) { console.error('syntax error in ' + e.file + ': ' + x.message); bad++; } }
    if (/\.css$/.test(e.file)) { const s = src.replace(/\/\*[\s\S]*?\*\//g, ''); if ((s.match(/{/g) || []).length !== (s.match(/}/g) || []).length) { console.error('unbalanced braces in ' + e.file); bad++; } }
  });
  if (bad) { console.error(bad + ' problem' + (bad > 1 ? 's' : '')); process.exit(1); }
  console.log('lint ok (' + man.length + ' parts)'); process.exit(0);
}
if (process.argv.includes('--check')) {
  if (fs.readFileSync(target, 'utf8') !== out) { console.error('index.html is out of date: run node build.js'); process.exit(1); }
  console.log('index.html up to date (' + man.length + ' parts, ' + out.length + ' chars)');
} else { fs.writeFileSync(target, out); console.log('built index.html from ' + man.length + ' parts (' + out.length + ' chars)'); }
