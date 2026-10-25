#!/usr/bin/env node
/* Assembles index.html from src/. Each manifest entry is one file wrapped in its original open/close tags
   (markup entries have none). Edit src/*, then run `node build.js`; `node build.js --check` fails if index.html is stale. */
const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, 'src');
const man = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
const out = man.map(e => e.open + fs.readFileSync(path.join(dir, e.file), 'utf8') + e.close).join('');
const target = path.join(__dirname, 'index.html');
if (process.argv.includes('--check')) {
  if (fs.readFileSync(target, 'utf8') !== out) { console.error('index.html is out of date: run node build.js'); process.exit(1); }
  console.log('index.html up to date (' + man.length + ' parts, ' + out.length + ' chars)');
} else { fs.writeFileSync(target, out); console.log('built index.html from ' + man.length + ' parts (' + out.length + ' chars)'); }
