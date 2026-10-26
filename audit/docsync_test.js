// Deal Documents sync against a mocked Supabase storage endpoint: upload on add, listed on the deal, restored on a fresh browser, removed remotely, and a missing bucket degrades to "this browser only".
//   node audit/docsync_test.js index.html
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const path = require('path'), fs = require('fs');
const A = require(path.join(__dirname, 'deal.js'));
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined }); const errs = [];
  let checks = 0, fails = 0; const check = (n, ok, d) => { checks++; if (!ok) { fails++; console.log('FAIL ' + n + (d ? '  ' + d : '')); } };
  const store = {}; let bucketMissing = false; const log = [];
  const open = async () => { const ctx = await b.newContext({ viewport: { width: 1200, height: 800 } }), p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
    await p.route(/supabase\.co/, r => { const u = new URL(r.request().url()), m = r.request().method(), mm = /\/storage\/v1\/object\/deal-documents\/(.+)$/.exec(u.pathname);
      if (u.pathname === '/auth/v1/user') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'user-1', email: 'a@b.c' }) });
      if (!mm) return r.abort(); const key = decodeURIComponent(mm[1]); log.push(m + ' ' + key);
      if (bucketMissing) return r.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ statusCode: '404', error: 'Bucket not found', message: 'Bucket not found' }) });
      if (m === 'POST') { store[key] = { body: r.request().postDataBuffer(), type: r.request().headers()['content-type'] }; return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ Key: 'deal-documents/' + key }) }); }
      if (m === 'GET') { const o = store[key]; return o ? r.fulfill({ status: 200, contentType: o.type || 'application/octet-stream', body: o.body }) : r.fulfill({ status: 404, contentType: 'application/json', body: '{"message":"Object not found"}' }); }
      if (m === 'DELETE') { delete store[key]; return r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }); }
      return r.abort(); });
    await p.addInitScript(() => { localStorage.setItem('bkcapital.supabase.auth.v01', JSON.stringify({ access_token: 'tok', refresh_token: 'r', expires_at: Date.now() + 3600000, user: { id: 'user-1', email: 'a@b.c' } })); });
    await p.goto('file://' + path.resolve(process.argv[2])); await p.waitForTimeout(800);
    await p.evaluate(a => { document.documentElement.classList.add('bk-auth-ok'); bkCreateNewDeal(a); }, A); await p.waitForTimeout(300); return { p, ctx }; };
  // 1. add while signed in: uploaded, listed on the deal
  let { p, ctx } = await open();
  const add = await p.evaluate(async () => { const f = new File([new Uint8Array(5000).fill(7)], 'ledger.pdf', { type: 'application/pdf' }); const rec = await bkDocsAdd('t12', f); await new Promise(r => setTimeout(r, 1200)); return { id: rec.id, files: bkLoad()._files, label: bkDocsSyncLabel(rec.id) }; });
  check('a file added while signed in is uploaded to the account bucket', Object.keys(store).some(k => /^user-1\/.+\/f.+-ledger\.pdf$/.test(k)) && store[Object.keys(store)[0]].body.length === 5000, JSON.stringify(Object.keys(store)));
  check('the deal lists it, and the page says it is saved to the account', add.files && add.files[add.id] && add.files[add.id].slot === 't12' && /saved to your account/.test(add.label), JSON.stringify(add));
  const photoSet = await p.evaluate(async () => { const c = document.createElement('canvas'); c.width = 400; c.height = 300; const g = c.getContext('2d'); g.fillStyle = '#39a'; g.fillRect(0, 0, 400, 300); const b = await new Promise(r => c.toBlob(r, 'image/jpeg')); await bkDocsSetPhoto(new File([b], 'front.jpg', { type: 'image/jpeg' })); await new Promise(r => setTimeout(r, 1200)); return Object.values(bkLoad()._files).filter(f => f.slot === 'photo').length; });
  check('the property photo is stored too, and a second photo replaces the first in the account', photoSet === 1);
  const saved = await p.evaluate(() => JSON.stringify(bkLoad()));
  // 2. a fresh browser (no local files) with the same deal: the files come back
  await ctx.close(); ({ p, ctx } = await open());
  await p.evaluate(s => { const d = JSON.parse(s); bkSave(d); showSheet('Deal Documents'); }, saved); await p.waitForTimeout(2500);
  const back = await p.evaluate(async () => { const l = await bkDocsList(); return { slots: l.map(f => f.slot).sort(), size: (l.find(f => f.slot === 't12') || {}).size, txt: document.querySelector('#viewport').innerText }; });
  check('on a fresh browser the deal\'s files are fetched back from the account', JSON.stringify(back.slots) === '["photo","t12"]' && back.size === 5000 && /ledger\.pdf/.test(back.txt), JSON.stringify(back.slots));
  // 3. removing a file removes it from the account
  const nbefore = Object.keys(store).length;
  await p.evaluate(async () => { const l = await bkDocsList(), f = l.find(x => x.slot === 't12'); window.confirm = () => true; await bkDocsRemove(f.id); await new Promise(r => setTimeout(r, 800)); });
  check('removing a file deletes it from the account and from the deal list', Object.keys(store).length === nbefore - 1 && await p.evaluate(() => !Object.values(bkLoad()._files || {}).some(f => f.slot === 't12')));
  // 4. a file that was added before signing in is uploaded the first time the deal is opened signed in
  await ctx.close(); ({ p, ctx } = await open());
  await p.evaluate(async () => { const keep = localStorage.getItem('bkcapital.supabase.auth.v01'); localStorage.removeItem('bkcapital.supabase.auth.v01'); await bkDocsAdd('costar', new File(['hello costar'], 'costar.csv', { type: 'text/csv' })); window.__keep = keep; });
  const lab0 = await p.evaluate(async () => { showSheet('Deal Documents'); await new Promise(r => setTimeout(r, 500)); const l = await bkDocsList(); return bkDocsSyncLabel(l[0].id); });
  check('signed out, a file is marked as kept in this browser only', /this browser only/.test(lab0), lab0);
  await p.evaluate(() => { localStorage.setItem('bkcapital.supabase.auth.v01', window.__keep); bkDocsSyncNow(); }); await p.waitForTimeout(2000);
  check('after signing in the existing local file is uploaded once', Object.keys(store).some(k => /costar\.csv$/.test(k)) && await p.evaluate(() => Object.values(bkLoad()._files || {}).some(f => f.slot === 'costar')));
  // 5. storage not set up: files stay local and the page explains
  bucketMissing = true; await ctx.close(); ({ p, ctx } = await open());
  const miss = await p.evaluate(async () => { const rec = await bkDocsAdd('om', new File(['om'], 'om.pdf', { type: 'application/pdf' })); await new Promise(r => setTimeout(r, 1200)); showSheet('Deal Documents'); await new Promise(r => setTimeout(r, 600)); return { label: bkDocsSyncLabel(rec.id), txt: document.querySelector('#viewport').innerText, local: (await bkDocsList()).length }; });
  check('with no bucket the file stays in this browser and the page points to the migration', /storage not set up/.test(miss.label) && /BK_Capital_V35_Documents_Migration\.sql/.test(miss.txt) && miss.local === 1, miss.label);
  check('no page errors', errs.length === 0, errs.join(' | '));
  await b.close(); console.log(checks + ' checks, ' + fails + ' failures'); process.exit(fails ? 1 : 0);
})();
