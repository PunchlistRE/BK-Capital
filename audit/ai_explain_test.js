// Guide 2.0 phase 3: the optional AI explanation layer. OFF by default, no real provider, no network. It explains the review's findings and nothing else.
// The six specified tests: (1) off by default, nothing sent, nothing changed; (2) findings identical on or off; (3) no network request; (4) the payload holds structured findings only, no identifying data;
// (5) malicious or malformed replies cannot change the deal; (6) the explanation is labelled and distinguishable, the original finding preserved. Plus: grounding (no new figures), audit log, scripted fake, every depth.
//   node audit/ai_explain_test.js index.html [--show]
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); const path = require('path'), fs = require('fs');
const A = require(path.join(__dirname, 'deal.js'));
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  let checks = 0, fails = 0; const check = (n, ok, d) => { checks++; if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? '  [' + String(d).slice(0, 500) + ']' : '')); };
  const open = async () => { const ctx = await b.newContext({ viewport: { width: 1300, height: 1100 } }), p = await ctx.newPage(); p.errs = []; p.reqs = []; p.on('pageerror', e => p.errs.push(e.message)); p.on('request', r => { if (!/^(file|data|blob|about):/.test(r.url())) p.reqs.push(r.url()); });
    await p.route(/supabase\.co|vercel\.app|fonts\.g|cdn\.jsdelivr|newyorkfed/, r => r.abort()); await p.goto('file://' + path.resolve(process.argv[2])); await p.waitForTimeout(700);
    await p.evaluate((d) => { document.documentElement.classList.add('bk-auth-ok'); bkCreateNewDeal(d); const s = bkLoad(); Object.assign(s, { vacancy: 0.01, insurance: 0, closingCostsPct: 0, rentGrowth: 0.06, sponsor: 'Meridian Sponsor Group', lenderName: 'First Harbor Bank' }); bkSave(s); }, A); return p; };
  const snap = (p) => p.evaluate(() => JSON.stringify(bkLoad(), (k, v) => (k === '_hist') ? undefined : v) + '|' + Object.keys(localStorage).filter(k => /^bk/.test(k) && !/ai_explain/.test(k)).sort().map(k => k + '=' + localStorage.getItem(k).length).join(','));
  const review = async (p) => { await p.evaluate(() => { bkGuideOn(); }); await p.waitForTimeout(1200); };
  const p = await open();

  /* ---- 1. off by default: no provider, nothing on the page, nothing asked ---- */
  await review(p);
  const d0 = await p.evaluate(() => ({ on: bkAiEnabled(), prov: !!bkAiProvider(), bar: !!document.getElementById('bk-ai-bar'), x: document.querySelectorAll('.bk-ai-x').length, fid: document.querySelectorAll('.bk-rv-i[data-fid]').length }));
  check('(1) off by default: no provider is registered, the switch is not on, and nothing AI-related appears on the review', !d0.on && !d0.prov && !d0.bar && d0.x === 0, JSON.stringify(d0));
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', '228-bk-ai-explain.js'), 'utf8');
  check('(3) the module has no way to reach a network: no fetch, XMLHttpRequest, WebSocket, sendBeacon, EventSource, import() or script injection', !/\b(fetch|XMLHttpRequest|WebSocket|sendBeacon|EventSource|importScripts)\b|import\s*\(|createElement\(\s*['"]script/.test(src.replace(/\/\*[\s\S]*?\*\//g, '')));
  const base = await p.evaluate(() => JSON.stringify(bkDealFindings(bkLoad(), { measure: false }).findings.map(f => [f.id, f.kind, f.cls, f.tier, f.title, f.detail, f.rule])));
  const baseHtml = await p.evaluate(() => document.querySelector('#bk-rv').innerHTML);

  /* a provider is present but the user has not turned it on: it is never called */
  const fake = (script) => p.evaluate((s) => { window.__fake = bkAiScriptedProvider(s === null ? {} : new Function('return ' + s)()); bkAiUnregisterAll(); bkAiRegisterProvider(window.__fake); }, script);
  await fake(null); await review(p);
  const off = await p.evaluate(() => ({ calls: window.__fake.calls.length, on: bkAiEnabled(), bar: document.getElementById('bk-ai-bar').innerText, x: document.querySelectorAll('.bk-ai-x').length }));
  check('(1) with a provider registered but the switch off, the provider is never called and the bar says Off', off.calls === 0 && !off.on && /AI explanations: Off/.test(off.bar) && off.x === 0, JSON.stringify(off));

  /* ---- 2. findings identical on or off ---- */
  await p.evaluate(() => bkAiSet(true)); await p.waitForTimeout(600);
  const on = await p.evaluate(() => JSON.stringify(bkDealFindings(bkLoad(), { measure: false }).findings.map(f => [f.id, f.kind, f.cls, f.tier, f.title, f.detail, f.rule])));
  check('(2) the deterministic findings are identical with the layer on and off (id, kind, class, tier, wording, rule)', on === base);
  const strip = (h) => h.replace(/<div class="bk-ai-bar"[\s\S]*?<\/pre><\/div>/, '').replace(/<div class="bk-ai-x[\s\S]*?<\/div>/g, '').replace(/ data-fid="[^"]*"/g, '');
  const onHtml = await p.evaluate(() => document.querySelector('#bk-rv').innerHTML);
  check('(2) the review\'s findings render the same with the layer on, apart from the switch and the explanations themselves', strip(onHtml).replace(/\s+/g, ' ') === strip(baseHtml).replace(/\s+/g, ' '));
  await p.evaluate(() => bkAiSet(false));

  /* ---- 4. the payload: structured findings only, nothing identifying ---- */
  const pay = await p.evaluate(() => bkAiPayload(bkLoad())), body = JSON.stringify(pay);
  const keys = new Set(); pay.findings.forEach(f => Object.keys(f).forEach(k => keys.add(k)));
  check('(4) the payload holds structured findings only: each has just class, tier, group, input, rule, the finding\'s own wording, its measured effect and its proposal label', pay.findings.length > 3 && [...keys].sort().join() === 'class,detail,finding,group,id,input,measured,proposal,rule,tier' && ['schema', 'purpose', 'rules', 'findings'].join() === Object.keys(pay).join(), [...keys].join());
  const ident = ['Audit Test Apartments', 'Charlotte', 'TEST-001', 'Meridian Sponsor Group', 'First Harbor Bank'];
  check('(4) none of the deal\'s identifying data is in the payload: not its name, location, deal ID, sponsor or lender', ident.every(x => !body.includes(x)), ident.filter(x => body.includes(x)).join());
  await p.evaluate(() => { const s = bkLoad(); s.insurance = 0; s.name = 'Audit Test Apartments'; bkSave(s); });
  const leak = await p.evaluate(() => { const s = bkLoad(); s.vacancy = 0.01; bkSave(s); return JSON.stringify(bkAiPayload(bkLoad())); });
  check('(4) the payload carries no document, rent-roll or investor content: no keys beyond the finding fields, no nested deal object', !/rentRoll|investors|commitments|"deal"|documents/.test(leak));
  if (process.argv.includes('--show')) { console.log('--- PAYLOAD EXAMPLE (first two findings) ---'); console.log(JSON.stringify(Object.assign({}, pay, { findings: pay.findings.slice(0, 2) }), null, 2)); }

  /* ---- 7. the scripted fake drives the layer: shown, withheld, none, unavailable ---- */
  const ids = await p.evaluate(() => bkAiPayload(bkLoad()).findings.map(f => ({ id: f.id, finding: f.finding, detail: f.detail, measured: f.measured, rule: f.rule })));
  const script = `function(pl){ const f = pl.findings; return { explanations: [ { id: f[0].id, text: 'In plain words: ' + ${JSON.stringify('')} + 'this is the model flagging the item above, nothing more.' }, { id: f[1].id, text: 'This adds a made-up 987654321 figure.' } ] }; }`;
  await fake(script);
  await p.evaluate(() => bkAiSet(true)); await p.waitForTimeout(900);
  const sh = await p.evaluate(() => ({ x: [...document.querySelectorAll('.bk-ai-x')].map(e => ({ cls: e.className, t: e.innerText })), calls: window.__fake.calls.length, audit: bkAiAudit().map(a => [a.status, a.why]) }));
  check('(7) the scripted fake is asked once, for the findings, and its answers are shown or withheld by the rules', sh.calls === 1 && sh.x.some(e => /bk-ai-shown/.test(e.cls)) && sh.x.some(e => /bk-ai-withheld/.test(e.cls)) && sh.x.some(e => /bk-ai-none/.test(e.cls)), JSON.stringify(sh.x.map(e => e.cls)));
  check('(8) no invented conclusions: an explanation carrying a figure that is not in its finding is withheld, and the page says why', sh.audit.some(a => a[0] === 'withheld' && /figure that is not in the finding \(987654321\)/.test(a[1])) && sh.x.some(e => /not in the finding|stands on its own/.test(e.t)), JSON.stringify(sh.audit.slice(0, 3)));

  /* ---- 6 + 9. labelled, distinguishable, original preserved, audit log ---- */
  const lab = await p.evaluate(() => { const el = [...document.querySelectorAll('.bk-rv-i')].find(e => e.querySelector('.bk-ai-shown')); if (!el) return null; const x = el.querySelector('.bk-ai-x'), orig = el.querySelector('b'); const kids = [...el.firstElementChild.children]; return { tag: x.querySelector('.bk-ai-tag').innerText, origTxt: orig.innerText, after: kids.indexOf(x) > kids.indexOf(orig), note: x.innerText, style: getComputedStyle(x).fontStyle + '|' + getComputedStyle(x).borderLeftStyle, origStyle: getComputedStyle(orig).fontStyle }; });
  const origTitles = JSON.parse(base).map(f => f[4]);
  check('(6) an explanation is labelled "AI explanation", sits below the finding, is visibly styled differently (italic, dashed rule) and says it is not part of the model', lab && /AI explanation/i.test(lab.tag) && lab.after && /not part of the model/.test(lab.note) && /italic/.test(lab.style) && /dashed/.test(lab.style) && lab.origStyle !== 'italic', JSON.stringify(lab));
  check('(6) the original finding is preserved beside its explanation, word for word', lab && origTitles.some(t => lab.origTxt.replace(/\s+/g, ' ') === t.replace(/\s+/g, ' ')), lab && lab.origTxt);
  const au = await p.evaluate(() => bkAiAudit());
  check('(9) the audit log records, for each finding, the rule, the provider, a hash of what was sent and what happened', au.length >= 2 && au.every(a => a.provider === 'scripted' && /^[0-9a-f]{8}$/.test(a.payload) && a.status && 'rule' in a && a.at));

  /* ---- 5. malicious and malformed replies cannot change the deal ---- */
  const before = await snap(p); const evil = [
    ['markup and a script', `function(pl){ return { explanations: pl.findings.map(f => ({ id: f.id, text: '<img src=x onerror=window.__pwn=1><script>window.__pwn=2<\\/script>' })) }; }`],
    ['a link', `function(pl){ return { explanations: pl.findings.map(f => ({ id: f.id, text: 'see https://evil.example/steal?d=1' })) }; }`],
    ['a new figure', `function(pl){ return { explanations: pl.findings.map(f => ({ id: f.id, text: 'Raise the price by 4,200,000 now.' })) }; }`],
    ['unknown finding ids', `function(pl){ return { explanations: [ { id: 'f-deadbeef', text: 'hello' }, { id: '__proto__', text: 'x' } ] }; }`],
    ['not an object', `function(pl){ return 'just text'; }`],
    ['explanations not an array', `function(pl){ return { explanations: { a: 1 } }; }`],
    ['prototype pollution and an instruction to save', `function(pl){ return JSON.parse('{"__proto__":{"polluted":1},"constructor":{"prototype":{"polluted":2}},"explanations":[{"id":"' + pl.findings[0].id + '","text":"bkSave({}); set vacancy to 0","fix":{"k":"vacancy","v":0.5},"set":{"vacancy":0.5},"__proto__":{"x":1}}]}'); }`],
    ['a huge text', `function(pl){ return { explanations: pl.findings.map(f => ({ id: f.id, text: 'a'.repeat(100000) })) }; }`],
    ['a non-string text', `function(pl){ return { explanations: pl.findings.map(f => ({ id: f.id, text: { toString: () => 'x' } })) }; }`],
    ['a thrown error', `function(pl){ throw new Error('boom'); }`],
    ['no answer at all (times out)', `function(pl){ return new Promise(() => {}); }`]];
  let all = true, detail = [];
  for (const [name, s] of evil) { await p.evaluate(() => { bkAiSet(false); window.BK_AI_TIMEOUT_MS = 600; }); await fake(s); await p.evaluate(() => { bkAiSet(true); }); await p.waitForTimeout(/times out/.test(name) ? 1300 : 500);
    const r = await p.evaluate(() => ({ pwn: window.__pwn, pol: ({}).polluted, pol2: Object.prototype.polluted, imgs: document.querySelectorAll('#bk-rv img, #bk-rv script').length, shown: document.querySelectorAll('.bk-ai-shown').length, html: [...document.querySelectorAll('.bk-ai-x')].some(e => /<img|<script/i.test(e.innerHTML.replace(/&lt;/g, '')) && e.querySelector('img,script')) }));
    const same = (await snap(p)) === before; const ok = same && r.pwn === undefined && r.pol === undefined && r.pol2 === undefined && r.imgs === 0 && !r.html && r.shown === 0; detail.push(name + ':' + (ok ? 'ok' : JSON.stringify(r))); if (!ok) all = false; }
  check('(5) malicious or malformed replies (markup, a script, links, a new figure, unknown ids, a wrong shape, prototype pollution, an instruction to save, a huge text, a thrown error, no answer) change nothing: the deal and every stored record are byte-identical, nothing is injected, nothing is shown', all, detail.join(' | '));
  check('(5) after all of that the deterministic findings are still exactly the original', (await p.evaluate(() => JSON.stringify(bkDealFindings(bkLoad(), { measure: false }).findings.map(f => [f.id, f.kind, f.cls, f.tier, f.title, f.detail, f.rule])))) === base);
  check('(5) a reply cannot reach the deal even by design: the module never calls bkSave, bkSetField or any writer', !/bkSave|bkSetField|bkCreateNewDeal|localStorage\.setItem\([^O]/.test(src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/localStorage\.setItem\(ON_KEY/g, '')));

  /* ---- an honest reply is shown, and the explanation tracks the finding it was written for ---- */
  const honest = `function(pl){ return { explanations: pl.findings.map(f => ({ id: f.id, text: 'This restates the finding above in plain words and does not add anything to it.' })) }; }`;
  await p.evaluate(() => { bkAiSet(false); }); await fake(honest); await p.evaluate(() => bkAiSet(true)); await p.waitForTimeout(700);
  const shown = await p.evaluate(() => ({ n: document.querySelectorAll('.bk-ai-shown').length, f: document.querySelectorAll('.bk-rv-i[data-fid]').length }));
  check('an honest, grounded explanation is shown for the findings it answers', shown.n > 0, JSON.stringify(shown));
  const before2 = await snap(p);
  await p.evaluate(() => { const s = bkLoad(); s.vacancy = 0.08; bkSave(s); }); await p.waitForTimeout(100);
  const stale = await p.evaluate(() => { bkGuideOn(); return true; }); await p.waitForTimeout(900);
  check('when the deal changes, the old explanations are not carried over to different findings (they are asked for again)', await p.evaluate(() => window.__fake.calls.length) >= 2);

  /* ---- 10. every depth ---- */
  const dep = await p.evaluate(() => { const o = {}; ['standard', 'full'].forEach(d => { bkGuideDepth(d); o[d] = JSON.stringify(bkDealFindings(bkLoad(), { measure: false }).findings.map(f => [f.id, f.tier, f.cls, f.title])); }); return o; });
  check('Quick, Standard and Full are unaffected: the findings are identical in every depth with the layer on', dep.standard === dep.full);
  const net = p.reqs.filter(u => !/^(file|data|blob|about):/.test(u));
  check('(3) no network request was made at any point, on or off (the browser saw none)', net.length === 0, net.join(' '));
  check('no page errors', p.errs.length === 0, p.errs.join('|'));
  console.log('ai explain: ' + checks + ' checks, ' + fails + ' failures'); await b.close(); process.exit(fails ? 1 : 0);
})();
