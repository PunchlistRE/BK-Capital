
/* V29.20.0 - IMPORT DEAL. Upload a Yardi-format T-12 (.xlsx / .xlsm / .csv, or a PDF print of one), extract the line items, foot them to
   the statement's own totals, and create a deal. NOI comes from the LINE ITEMS (never the summary figure); purchase price = NOI / cap rate.
   The extraction rules are the ones audit/real/build_real_deals.py uses, so results are checkable against that independent build. */
(function(){
'use strict';
if(typeof RENDERERS === 'undefined') return;
var DEFAULT_CAP = 0.057;
var S = { file:'', kind:'', msg:'', props:[], busy:false };
function esc(v){ return String(v == null ? '' : v).replace(/[&<>"]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
function $(v){ var x = Number(v); if(!isFinite(x)) return 'n/a'; var b = Math.abs(x).toLocaleString('en-US', {maximumFractionDigits:0}); return x < 0 ? '($' + b + ')' : '$' + b; }
function P(v, d){ return (v == null || !isFinite(v)) ? 'n/a' : (v * 100).toFixed(d == null ? 2 : d) + '%'; }
var clean = function(x){ return String(x == null ? '' : x).replace(/[‘’|]/g, '').trim(); };

/* ------------------------------------------------------------ cell parsing */
function toNum(t){
  if(typeof t === 'number') return isFinite(t) ? t : null;
  var s = String(t == null ? '' : t).trim(); if(!s) return null;
  if(/^#+$/.test(s)) return null;                                   /* a column too narrow to print the number */
  if(s === '-' || s === '–' || s === '$-' || s === '$ -') return 0;
  var neg = /^\(.*\)$/.test(s) || /^-/.test(s), pct = /%$/.test(s);
  s = s.replace(/[()$,%\s]/g, '').replace(/^-/, ''); if(!/^\d*\.?\d+$/.test(s)) return null;
  var v = parseFloat(s); if(pct) v /= 100; return neg ? -v : v;
}

/* ------------------------------------------------------------ file readers */
function parseCSV(text){
  var rows = [], row = [], cur = '', q = false;
  for(var i = 0; i < text.length; i++){ var c = text[i];
    if(q){ if(c === '"'){ if(text[i + 1] === '"'){ cur += '"'; i++; } else q = false; } else cur += c; }
    else if(c === '"') q = true; else if(c === ','){ row.push(cur); cur = ''; }
    else if(c === '\n' || c === '\r'){ if(c === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += c; }
  if(cur !== '' || row.length){ row.push(cur); rows.push(row); }
  return rows.map(function(r){ return r.map(function(x){ var n = toNum(x); return (x.trim() !== '' && n !== null && /[\d]/.test(x) && !/^[A-Za-z]/.test(x.trim())) ? n : (x.trim() === '' ? null : x); }); });
}
async function inflate(u8){
  var ds = new DecompressionStream('deflate'), w = ds.writable.getWriter(); w.write(u8).catch(function(){}); w.close().catch(function(){});
  return new Uint8Array(await new Response(ds.readable).arrayBuffer());
}
function mm(a, b){ return [a[0]*b[0]+a[1]*b[2], a[0]*b[1]+a[1]*b[3], a[2]*b[0]+a[3]*b[2], a[2]*b[1]+a[3]*b[3], a[4]*b[0]+a[5]*b[2]+b[4], a[4]*b[1]+a[5]*b[3]+b[5]]; }
/* ToUnicode CMap -> { map:{code:string}, len:bytes per code } */
function parseCMap(src){
  var map = {}, len = 1, m, re;
  if((m = /begincodespacerange\s*<([0-9A-Fa-f]+)>/.exec(src))) len = Math.max(1, m[1].length / 2);
  var u16 = function(h){ var o = ''; for(var k = 0; k + 3 < h.length + 1; k += 4){ var c = parseInt(h.substr(k, 4), 16); if(!isNaN(c)) o += String.fromCharCode(c); } return o; };
  re = /beginbfchar([\s\S]*?)endbfchar/g; while((m = re.exec(src))){ var rr = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g, e; while((e = rr.exec(m[1]))) map[parseInt(e[1], 16)] = u16(e[2]); }
  re = /beginbfrange([\s\S]*?)endbfrange/g;
  while((m = re.exec(src))){ var r2 = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*(\[[^\]]*\]|<[0-9A-Fa-f]+>)/g, e2;
    while((e2 = r2.exec(m[1]))){ var lo = parseInt(e2[1], 16), hi = parseInt(e2[2], 16), d = e2[3];
      if(d.charAt(0) === '['){ var parts = d.match(/<([0-9A-Fa-f]+)>/g) || []; for(var q = 0; q < parts.length && lo + q <= hi; q++) map[lo + q] = u16(parts[q].slice(1, -1)); }
      else { var base = d.slice(1, -1), b0 = parseInt(base, 16); for(var c = lo; c <= hi && c - lo < 70000; c++){ var cp = b0 + (c - lo); map[c] = base.length <= 4 ? String.fromCharCode(cp) : u16(base); } } } }
  return { map:map, len:len };
}
/* content stream -> positioned text runs [{x, y, t}]. fonts: {resourceName: cmap} for fonts that carry a ToUnicode map */
function textRuns(src, fonts){
  var runs = [], st = [], ctm = [1,0,0,1,0,0], tm = [1,0,0,1,0,0], ops = [], i = 0, n = src.length, dec = new TextDecoder('windows-1252'), hexUnread = 0, cur = null, fsize = 10, lastW = 0;
  fonts = fonts || {};
  function readString(){ var depth = 1, out = []; i++;
    while(i < n && depth > 0){ var c = src.charCodeAt(i);
      if(c === 92){ var d = src[i + 1]; i += 2;
        if(d === 'n') out.push(10); else if(d === 'r') out.push(13); else if(d === 't') out.push(9); else if(d === 'b') out.push(8); else if(d === 'f') out.push(12);
        else if(/[0-7]/.test(d)){ var o = d; while(o.length < 3 && /[0-7]/.test(src[i] || '')){ o += src[i]; i++; } out.push(parseInt(o, 8) & 255); }
        else if(d !== '\n' && d !== '\r') out.push(d.charCodeAt(0));
        continue; }
      if(c === 40) depth++; else if(c === 41){ depth--; if(depth === 0){ i++; break; } }
      out.push(c); i++; }
    lastW = 0;
    if(cur && cur.len === 2){ var t2 = ''; for(var k = 0; k + 1 < out.length; k += 2){ var cd = (out[k] << 8) | out[k + 1]; t2 += cur.map[cd] || ''; lastW += cur.w ? cur.w(cd) : 500; } return t2; }
    out.forEach(function(b){ lastW += cur && cur.w ? cur.w(b) : 500; });
    return cur && cur.map && cur.len === 1 && Object.keys(cur.map).length ? out.map(function(b){ return cur.map[b] != null ? cur.map[b] : String.fromCharCode(b); }).join('') : dec.decode(new Uint8Array(out)); }
  function readHex(){ var e = src.indexOf('>', i), h = src.slice(i + 1, e < 0 ? n : e).replace(/\s+/g, ''); i = e < 0 ? n : e + 1;
    lastW = 0; if(!cur || !cur.map){ hexUnread++; return ''; } var L = cur.len * 2, o = ''; for(var k = 0; k + L <= h.length; k += L){ var code = parseInt(h.substr(k, L), 16); o += cur.map[code] != null ? cur.map[code] : ''; lastW += cur.w ? cur.w(code) : 500; } return o; }
  function show(t, w){ if(!t) return; var x = tm[4]*ctm[0] + tm[5]*ctm[2] + ctm[4], y = tm[4]*ctm[1] + tm[5]*ctm[3] + ctm[5]; var sz = (fsize || 10) * Math.hypot(tm[0], tm[1]) * Math.hypot(ctm[0], ctm[1]); runs.push({ x:x, y:y, t:t, sz:sz, w:(w != null ? w : t.length * 500) / 1000 * sz }); }
  while(i < n){ var ch = src[i];
    if(/\s/.test(ch)){ i++; continue; }
    if(ch === '%'){ while(i < n && src[i] !== '\n' && src[i] !== '\r') i++; continue; }
    if(ch === '('){ var rs = readString(); ops.push({ s:rs, w:lastW }); continue; }
    if(ch === '<' && src[i + 1] === '<'){ i += 2; continue; }
    if(ch === '>' && src[i + 1] === '>'){ i += 2; continue; }
    if(ch === '<'){ var rh = readHex(); ops.push({ s:rh, w:lastW }); continue; }
    if(ch === '['){ var arr = []; i++; while(i < n && src[i] !== ']'){ if(/\s/.test(src[i])){ i++; continue; }
        if(src[i] === '('){ var s1 = readString(); arr.push({ t:s1, w:lastW }); } else if(src[i] === '<'){ var s2 = readHex(); arr.push({ t:s2, w:lastW }); }
        else { var m = /^[-+]?\d*\.?\d+/.exec(src.slice(i, i + 24)); if(m){ arr.push(parseFloat(m[0])); i += m[0].length; } else i++; } }
      i++; ops.push({ a:arr }); continue; }
    if(ch === '/'){ var m2 = /^\/[^\s\/\[\]()<>]*/.exec(src.slice(i, i + 80)); i += m2[0].length; ops.push({ nm:m2[0].slice(1) }); continue; }
    var m3 = /^[-+]?\d*\.?\d+/.exec(src.slice(i, i + 24));
    if(m3 && m3[0] !== '' && /[\d]/.test(m3[0])){ ops.push({ n:parseFloat(m3[0]) }); i += m3[0].length; continue; }
    var m4 = /^[A-Za-z*'"]+/.exec(src.slice(i, i + 12)); if(!m4){ i++; continue; } var op = m4[0]; i += op.length;
    var nums = ops.filter(function(o){ return o.n !== undefined; }).map(function(o){ return o.n; });
    if(op === 'q') st.push(ctm.slice()); else if(op === 'Q'){ if(st.length) ctm = st.pop(); }
    else if(op === 'cm' && nums.length >= 6) ctm = mm(nums.slice(-6), ctm);
    else if(op === 'BT') tm = [1,0,0,1,0,0];
    else if(op === 'Tf'){ var nm = ops.filter(function(o){ return o.nm !== undefined; }).pop(); cur = nm && fonts[nm.nm] ? fonts[nm.nm] : null; if(nums.length) fsize = nums[nums.length - 1]; }
    else if(op === 'Tm' && nums.length >= 6) tm = nums.slice(-6);
    else if((op === 'Td' || op === 'TD') && nums.length >= 2) tm = mm([1,0,0,1,nums[nums.length - 2], nums[nums.length - 1]], tm);
    else if(op === 'Tj'){ var s = ops.filter(function(o){ return o.s !== undefined; }).pop(); if(s) show(s.s, s.w); }
    else if(op === 'TJ'){ var a = ops.filter(function(o){ return o.a; }).pop(); if(a){ var tw = 0; show(a.a.map(function(z){ if(typeof z === 'number'){ tw -= z; return z < -250 ? ' ' : ''; } tw += z.w; return z.t; }).join(''), tw); } }
    ops = []; }
  return { runs:runs, hexUnread:hexUnread };
}
async function pdfSheet(buf, name){
  var u8 = new Uint8Array(buf), lat = ''; for(var k = 0; k < u8.length; k += 65536) lat += String.fromCharCode.apply(null, u8.subarray(k, k + 65536));
  /* object table: number -> {dict, s0, s1} (the byte range of its stream, if any) */
  var objs = {}, re = /(\d+)\s+\d+\s+obj\b([\s\S]*?)endobj/g, m;
  while((m = re.exec(lat))){ var body = m[2], si = body.search(/stream\r?\n/), dict = si >= 0 ? body.slice(0, si) : body, o = { dict:dict };
    if(si >= 0){ var st = m.index + m[0].indexOf(body) + body.slice(si).search(/\n/) + 1 + si; o.s0 = lat.indexOf('stream', m.index + m[0].indexOf(body) + si) ; var after = o.s0 + 6; if(lat[after] === '\r') after++; if(lat[after] === '\n') after++; o.s0 = after; o.s1 = lat.indexOf('endstream', after); }
    objs[m[1]] = o; }
  var cache = {};
  async function streamOf(num){ if(cache[num] !== undefined) return cache[num]; var o = objs[num]; if(!o || o.s0 == null || o.s1 < 0){ cache[num] = null; return null; }
    var raw = u8.subarray(o.s0, o.s1); if(raw[raw.length - 1] === 10) raw = raw.subarray(0, raw.length - 1); if(raw[raw.length - 1] === 13) raw = raw.subarray(0, raw.length - 1);
    var out = null; if(/FlateDecode/.test(o.dict)){ try { out = await inflate(raw); } catch(e){ out = null; } } else if(!/Filter/.test(o.dict)) out = raw; cache[num] = out; return out; }
  var asText = function(b){ var t = ''; for(var q = 0; q < b.length; q += 65536) t += String.fromCharCode.apply(null, b.subarray(q, q + 65536)); return t; };
  async function arrText(txt){ var r = /^\s*(\d+)\s+\d+\s+R\s*$/.exec(txt); return r && objs[r[1]] ? objs[r[1]].dict : txt; }
  async function fontCMap(fnum){ var f = objs[fnum]; if(!f) return null; var t = /\/ToUnicode\s+(\d+)\s+\d+\s+R/.exec(f.dict), cm = null;
    if(t){ var sb = await streamOf(t[1]); if(sb) cm = parseCMap(asText(sb)); }
    var w = null, d = f.dict, df = /\/DescendantFonts\s*\[\s*(\d+)\s+\d+\s+R/.exec(d);
    if(df && objs[df[1]]){ var dd = objs[df[1]].dict, dw = /\/DW\s+(\d+)/.exec(dd), wm = /\/W\s*(\[[\s\S]*?\]\s*\]|\[[^\[\]]*\]|\d+\s+\d+\s+R)/.exec(dd), wt = wm ? (/^\d+\s+\d+\s+R$/.test(wm[1]) ? await arrText(wm[1]) : wm[1]) : '', tab = {}, dwv = dw ? +dw[1] : 1000;
      var tk = wt.replace(/^\s*\[/, '').match(/\[|\]|-?\d*\.?\d+/g) || [], q = 0;
      while(q < tk.length){ var c1 = +tk[q++]; if(tk[q] === '['){ q++; var cc = c1; while(q < tk.length && tk[q] !== ']') tab[cc++] = +tk[q++]; q++; } else { var c2 = +tk[q++], ww = +tk[q++]; for(var cx = c1; cx <= c2 && cx - c1 < 70000; cx++) tab[cx] = ww; } }
      w = function(code){ return tab[code] != null ? tab[code] : dwv; }; }
    else { var fc = /\/FirstChar\s+(\d+)/.exec(d), wa = /\/Widths\s*(\[[^\]]*\]|\d+\s+\d+\s+R)/.exec(d);
      if(fc && wa){ var wt2 = /^\d+\s+\d+\s+R$/.test(wa[1]) ? await arrText(wa[1]) : wa[1], arr = (wt2.match(/-?\d*\.?\d+/g) || []).map(Number), f0 = +fc[1], mw = /\/MissingWidth\s+(\d+)/.exec(d); w = function(code){ var v = arr[code - f0]; return v != null ? v : (mw ? +mw[1] : 500); }; } }
    if(!cm && !w) return null; return { map:cm ? cm.map : null, len:cm ? cm.len : 1, w:w }; }
  async function fontsOf(resText){ var out = {}, fm = /\/Font\s*(<<([\s\S]*?)>>|(\d+)\s+\d+\s+R)/.exec(resText || ''); if(!fm) return out;
    var inner = fm[2] != null ? fm[2] : (objs[fm[3]] ? objs[fm[3]].dict : ''), pr = /\/([^\s\/<>\[\]()]+)\s+(\d+)\s+\d+\s+R/g, e;
    while((e = pr.exec(inner))){ var cm = await fontCMap(e[2]); if(cm) out[e[1]] = cm; } return out; }
  var pages = [], hex = 0, any = 0, pageNums = Object.keys(objs).filter(function(k){ return /\/Type\s*\/Page\b(?!s)/.test(objs[k].dict); }).sort(function(a, b){ return a - b; }), seenStreams = {}, allFonts = {};
  for(var pn = 0; pn < pageNums.length; pn++){ var pd = objs[pageNums[pn]].dict, res = ''; var rm = /\/Resources\s*(\d+)\s+\d+\s+R/.exec(pd); res = rm ? (objs[rm[1]] ? objs[rm[1]].dict : '') : pd;
    var fonts = await fontsOf(res); Object.keys(fonts).forEach(function(k){ allFonts[k] = fonts[k]; });
    var cm2 = /\/Contents\s*(\[([^\]]*)\]|(\d+)\s+\d+\s+R)/.exec(pd), refs = cm2 ? (cm2[2] != null ? (cm2[2].match(/\d+(?=\s+\d+\s+R)/g) || []) : [cm2[3]]) : [];
    var src = ''; for(var rf = 0; rf < refs.length; rf++){ var sb = await streamOf(refs[rf]); seenStreams[refs[rf]] = 1; if(sb) src += asText(sb) + '\n'; }
    if(!src) continue; var tr = textRuns(src, fonts); hex += tr.hexUnread; if(tr.runs.length){ any += tr.runs.length; pages.push(tr.runs); } }
  if(!any){   /* no page tree found (damaged or unusual): fall back to every stream that looks like page content */
    for(var num in objs){ if(seenStreams[num]) continue; var sb2 = await streamOf(num); if(!sb2) continue; var src2 = asText(sb2); if(!/\bBT\b/.test(src2)) continue; var tr2 = textRuns(src2, allFonts); hex += tr2.hexUnread; if(tr2.runs.length){ any += tr2.runs.length; pages.push(tr2.runs); } } }
  if(!any) return { name:name, rows:[], unreadable:true, hex:hex };
  var rows = [], xs = [];
  pages.forEach(function(runs){ var lines = [];
    runs.sort(function(a, b){ return b.y - a.y || a.x - b.x; });
    runs.forEach(function(r){ var L = lines.length && Math.abs(lines[lines.length - 1].y - r.y) < 2.5 ? lines[lines.length - 1] : null; if(!L){ L = { y:r.y, cells:[] }; lines.push(L); } L.cells.push(r); });
    lines.forEach(function(L){ L.cells.sort(function(a, b){ return a.x - b.x; });
      var merged = []; L.cells.forEach(function(c){ var p = merged[merged.length - 1], sz = c.sz || 10;   /* glyph groups of one word arrive as separate runs: join those that touch */
        if(p){ var gap = c.x - (p.x + p.w); if(gap < sz * 0.12){ p.t += (gap > sz * 0.05 ? ' ' : '') + c.t; p.w = Math.max(p.w, c.x + c.w - p.x); return; } }
        merged.push({ x:c.x, t:c.t, sz:sz, w:c.w }); });
      var cells = [], cx = []; merged.forEach(function(c){ String(c.t).split(/ {2,}/).forEach(function(t){ t = t.trim(); if(t){ cells.push(t); cx.push(c.x); } }); });
      rows.push(cells.map(function(t){ var v = toNum(t); return (v !== null && /\d/.test(t) && !/[A-Za-z]/.test(t)) ? v : (/^#+$/.test(t) ? null : t); })); xs.push(cx); }); });
  return { name:name, rows:rows, xs:xs, hex:hex };
}
async function readFile(file){
  var ext = (file.name.split('.').pop() || '').toLowerCase();
  if(ext === 'xlsx' || ext === 'xlsm'){ await bkLoadSheetJs(); var wb = await bkXlsxPrepare(await file.arrayBuffer());
    return { kind:'xlsx', sheets:wb.SheetNames.map(function(n){ return { name:n, rows:XLSX.utils.sheet_to_json(wb.Sheets[n], { header:1, defval:null, raw:true }) }; }) }; }
  if(ext === 'csv') return { kind:'csv', sheets:[{ name:file.name.replace(/\.csv$/i, ''), rows:parseCSV(await file.text()) }] };
  if(ext === 'pdf'){ var ps = await pdfSheet(await file.arrayBuffer(), file.name.replace(/\.pdf$/i, '')); return { kind:'pdf', sheets:[ps], unreadable:!!ps.unreadable }; }
  throw new Error('Unsupported file type .' + ext + '. Use .xlsx, .xlsm, .csv or .pdf.');
}

/* ------------------------------------------------------------ Yardi T-12 extraction */
var NOT_OPEX = /^(total|net income|cash flow|mortgage|tuesday|distribution)/i;
var GROUPS_RX = [['taxes', /^property tax|real estate tax|^sewer tax/i], ['insurance', /^(building )?insurance/i], ['mgmt', /management fee|owner management|residential manag/i],
  ['utilities', /electric|^gas$|water|sewer|trash|cable/i], ['turnover', /turn ?over|make.?ready|painting|carpet|floor/i], ['payroll', /in.?house|payroll|salary/i],
  ['marketing', /broker|referral|marketing|advert/i], ['rm', /repair|maint|plumbing|appliance|hvac|pest|equipment|generator|irrigation|landscap|snow|lawn|elevator|cleaning|fire|security equip|cell monitoring/i]];
var NONREC = /bank interest|insurance claim|broker fee|security deposit interest|estimated future tax|partnership return|sales tax|settlement|incentive/i;
var SECTIONS = [['Residential Rent', 'TOTAL RESIDENTIAL RENT'], ['Other Property', 'TOTAL OTHER PROPERTY'], ['Property Exp', 'TOTAL PROPERTY EXP'], ['Office Exp', 'TOTAL OFFICE EXPENSES']];
var SEC_START = /^(residential rent|other property|commercial|property exp|office exp)/i;
function numbers(cells){ return cells.slice(2).filter(function(c){ return typeof c === 'number'; }); }
function extractBlock(name, rows){
  var facts = {}, items = [], head = -1;
  for(var i = 0; i < rows.length; i++){ var r = rows[i]; if(r && typeof r[0] === 'string' && /^section$/i.test(r[0].trim()) && typeof r[1] === 'string' && /line item/i.test(r[1])){ head = i; break; } }
  var from = head >= 0 ? head + 1 : 0;
  for(var a = 0; a < (head >= 0 ? head : rows.length); a++){ var f = rows[a]; if(!f || typeof f[0] !== 'string') continue;
    var k = f[0].trim(); if(/^type$/i.test(k)) facts.type = f[1]; else if(/^units$/i.test(k) && typeof f[1] === 'number') facts.units = f[1]; else if(/^sf$/i.test(k) && typeof f[1] === 'number') facts.sf = f[1];
    else if(/^cap rate/i.test(k) && typeof f[1] === 'number') facts.cap = f[1]; else if(/^t-?12 noi/i.test(k) && typeof f[1] === 'number') facts.summaryNOI = f[1];
    else if(/^annual rent/i.test(k) && typeof f[1] === 'number') facts.annualRent = f[1]; else if(/^implied value/i.test(k) && typeof f[1] === 'number') facts.impliedValue = f[1]; }
  for(var b = from; b < rows.length; b++){ var c = rows[b]; if(!c || typeof c[0] !== 'string' || typeof c[1] !== 'string') continue;
    if(head < 0 && !SEC_START.test(c[0].trim())) continue;
    var nums = numbers(c); if(!nums.length) continue; var total = nums[nums.length - 1];
    items.push({ sec:c[0].trim(), label:clean(c[1]), total:total, months:nums.slice(0, -1) }); }
  var title = ''; for(var t = 0; t < Math.min(rows.length, 4); t++){ if(rows[t] && typeof rows[t][0] === 'string' && /yardi|t-?12|source benchmark/i.test(rows[t][0])){ title = rows[t][0]; break; } }
  return { name:name, facts:facts, items:items, title:title };
}
function reconcile(items, mi, flags){
  var fix = new Map();
  SECTIONS.forEach(function(sp){ var sec = sp[0], tot = sp[1];
    var L = items.filter(function(r){ return r.sec.indexOf(sec) === 0 && !/^(total|net income|tuesday|distribution)/i.test(r.label); });
    var tr = items.filter(function(r){ return r.label.toUpperCase().indexOf(tot) === 0; })[0], T = tr ? tr.total : null;
    if(T === null || !L.length) return;
    if(sec === 'Office Exp') T = T - mi;
    var tol = Math.max(25, 0.0005 * Math.abs(T)), sumL = L.reduce(function(s, r){ return s + r.total; }, 0), gap = sumL - T;
    if(Math.abs(gap) <= Math.max(tol, 0.002 * Math.abs(T))) return;
    var best = null;
    L.forEach(function(r){ var v = r.total, c = [], ms = r.months, ssum = ms.reduce(function(s, x){ return s + x; }, 0);
      if(ms.length && ssum !== v) c.push(['months sum', ssum]);
      [-3, -2, -1, 1, 2, 3].forEach(function(kx){ c.push(['decimal point moved x10^' + kx, v * Math.pow(10, kx)]); });
      if(v) c.push(['sign flipped', -v]);
      c.forEach(function(cc){ var ng = gap - r.total + cc[1]; if(Math.abs(ng) <= tol && (best === null || Math.abs(ng) < best.g)) best = { g:Math.abs(ng), r:r, how:cc[0], nv:cc[1] }; }); });
    if(best){ fix.set(best.r, best.nv); flags.push("scan error corrected: '" + best.r.label + "' printed " + $(best.r.total) + ' -> ' + $(best.nv) + ' (' + best.how + '); this makes the ' + sec + ' section foot to its printed total'); }
    else flags.push(sec + ' lines (' + $(sumL) + ') do not foot to the printed section total (' + $(T) + ', gap ' + $(gap) + ') and no single-line scan error explains it: lines kept as printed');
  });
  return fix;
}
function autoGroup(label){ for(var q = 0; q < GROUPS_RX.length; q++){ if(GROUPS_RX[q][1].test(label)) return GROUPS_RX[q][0]; } return 'ga'; }
function buildProperty(blk){
  var flags = [], items = blk.items, f = blk.facts, inc = { rent:0, other:0 }, grp = { ga:0 }, nonrec = [], lines = [], fixedGroups = {};
  GROUPS_RX.forEach(function(g){ grp[g[0]] = 0; });
  var reported = {}; items.forEach(function(r){ reported[r.label.toUpperCase()] = r.total; });
  var mi0 = reported['MORTGAGE INTEREST'] || 0, fix = reconcile(items, mi0, flags);
  items.forEach(function(r){
    if(/^(total|net income)/i.test(r.label)) return;
    var v = fix.has(r) ? fix.get(r) : r.total;
    if(r.sec.indexOf('Residential Rent') === 0) inc.rent += v;
    else if(r.sec.indexOf('Other Property') === 0 || r.sec.indexOf('Commercial') === 0) inc.other += v;
    else if((r.sec.indexOf('Property Exp') === 0 || r.sec.indexOf('Office Exp') === 0) && !NOT_OPEX.test(r.label)){
      var auto = autoGroup(r.label), lg = window.bkLearn && window.bkLearn.get(r.label), g = lg && lg !== 'contract' ? lg : auto;
      lines.push({ label:r.label, amount:v, group:g, auto:auto, learned:!!(lg && lg !== 'contract'), fixed:fix.has(r) });
      if(g === 'exclude') return; grp[g] = (grp[g] || 0) + v; if(fix.has(r)) fixedGroups[g] = 1; }
    if(NONREC.test(r.label) && Math.abs(v) > 0) nonrec.push(r.label + ' ' + $(v));
  });
  var egi = inc.rent + inc.other, opex = 0; Object.keys(grp).forEach(function(k){ opex += grp[k]; });
  var noi = egi - opex, niKey = Object.keys(reported).filter(function(k){ return k.indexOf('NET INCOME') === 0; })[0], repNI = niKey ? reported[niKey] : null, mi = reported['MORTGAGE INTEREST'] || 0;
  var gap = repNI !== null ? noi - (repNI + mi) : null;
  flags.push('cross-check: income ' + $(egi) + ' - operating expenses ' + $(opex) + ' = NOI ' + $(noi) + (repNI !== null ? '; statement NET INCOME ' + $(repNI) + ' + mortgage interest ' + $(mi) + ' = ' + $(repNI + mi) + ' (difference ' + $(gap) + ')' : '; the statement prints no NET INCOME line to check against'));
  if(f.summaryNOI != null && noi) flags.push('summary figure T-12 NOI ' + $(f.summaryNOI) + ' is NOT used (it differs from the line items by ' + (((f.summaryNOI - noi) / noi) * 100).toFixed(0) + '%)');
  if(nonrec.length) flags.push('left in NOI as reported, but non-recurring / non-operating in nature: ' + nonrec.join('; '));
  return { name:blk.name, type:f.type || '', units:f.units || 0, sf:f.sf || 0, cap:f.cap != null ? f.cap : null, summaryNOI:f.summaryNOI, egi:egi, opex:opex, noi:noi, inc:inc, grp:grp, repNI:repNI, mi:mi, gap:gap, flags:flags, lines:lines, fixedGroups:fixedGroups, footFail:flags.some(function(x){ return /do not foot/.test(x); }), blk:blk,
    tied: gap !== null && Math.abs(gap) <= Math.max(1, 0.0025 * Math.abs(noi)), items:items.length };
}
function dealFor(p, cap, units){
  var egi = p.egi, grp = Object.assign({ taxes:0, insurance:0, utilities:0, rm:0, payroll:0, turnover:0, marketing:0, mgmt:0, ga:0 }, p.grp), u = units || p.units || 1, price = Math.round(p.noi / cap), mgmtPct = egi ? grp.mgmt / egi : 0;
  var d = { dealId:'IMP-' + p.name.replace(/[^A-Za-z0-9]+/g, '-').toUpperCase().slice(0, 24), name:p.name, dealType:'Acquisition', propertyType:'Multifamily', status:'Pipeline', closing:'1/1/2027',
    units:u, gsf:p.sf || 0, commercialArea:0, purchasePrice:price, t12noi:Math.round(p.noi * 100) / 100, avgRent:p.inc.rent / u / 12, otherIncomePerUnit:p.inc.other / u, vacancy:0, badDebtPct:0, mgmtPct:mgmtPct,
    taxes:r2(grp.taxes), insurance:r2(grp.insurance), utilities:r2(grp.utilities), rm:r2(grp.rm), contract:0, payroll:r2(grp.payroll), turnover:r2(grp.turnover), marketing:r2(grp.marketing), ga:r2(grp.ga), reserves:0,
    exitCap:cap, holdYears:5, occupancy:1, rentGrowth:0.03, otherGrowth:0.02, opexGrowth:0.03, taxGrowth:0.02, commercialRentGrowth:0, closingCostsPct:0.02, saleCostPct:0.02, miscPerGSF:0 };
  var sum = function(){ return d.taxes + d.insurance + d.utilities + d.rm + d.contract + d.payroll + d.turnover + d.marketing + d.ga + mgmtPct * egi; };
  d.ga = r2(d.ga + (p.opex - sum()));
  return d;
}
function r2(x){ return Math.round(x * 100) / 100; }
/* confidence in each figure: statement NOI is checked against its own printed net income plus mortgage interest, sections against their printed totals */
function confT12(e){
  var p = e.p, F = {}, set = function(k, l, why){ F[k] = { l:l, why:why }; }, tied = p.tied, noStmt = p.gap === null, gapTxt = p.gap === null ? '' : $(Math.abs(p.gap));
  var line = function(k, what, grp){ if(grp && p.fixedGroups && p.fixedGroups[grp]) return set(k, 'check', 'A scanned figure on one of these lines was corrected so its section foots to the printed total. Compare with the statement.');
    if(tied) set(k, p.footFail ? 'check' : 'verified', p.footFail ? 'NOI ties to the statement, but a section did not foot to its printed total.' : 'Line-item NOI equals the statement\'s net income plus mortgage interest (within ' + (gapTxt || '$0') + '), so this ' + what + ' reconciles.');
    else if(noStmt) set(k, 'check', 'The statement prints no net income line to check against.');
    else set(k, 'low', 'Line-item NOI differs from the statement\'s net income plus mortgage interest by ' + gapTxt + '. One line is probably misread.'); };
  line('avgRent', 'rent'); line('otherIncomePerUnit', 'other income'); set('vacancy', 'assumed', 'The T-12 shows rent as collected, so vacancy starts at 0%. Set your own on Deal Underwrite.');
  [['taxes', 'taxes'], ['insurance', 'insurance'], ['utilities', 'utilities'], ['rm', 'repairs and maintenance'], ['payroll', 'payroll'], ['turnover', 'turnover'], ['marketing', 'marketing'], ['ga', 'general and admin']].forEach(function(r){ var v = (p.grp || {})[r[0]];
    if((r[0] === 'taxes' || r[0] === 'insurance') && !v) set(r[0], 'low', 'No ' + r[1] + ' line was found in the statement, so this is $0.'); else if(v || r[0] === 'ga') line(r[0], r[1] + ' total', r[0]); });
  line('mgmtPct', 'management fee', 'mgmt'); line('t12noi', 'NOI');
  set('units', e.unitsSrc === 'edited' ? 'verified' : p.units ? 'check' : 'low', e.unitsSrc === 'edited' ? 'You entered it.' : p.units ? 'From the statement\'s summary block; nothing else corroborates it.' : 'The statement gives no unit count. Enter it.');
  set('gsf', p.sf ? 'check' : 'low', p.sf ? 'From the statement\'s summary block.' : 'No square footage on the statement.');
  set('exitCap', e.capSrc === 'edited' ? 'verified' : e.capSrc === 'source' ? 'check' : 'assumed', e.capSrc === 'edited' ? 'You set it.' : e.capSrc === 'source' ? 'The cap rate printed on the statement summary.' : 'Default cap rate, not from the statement. Set your own.');
  set('purchasePrice', 'assumed', 'Derived: line-item NOI divided by the cap rate. It is not a price from the documents.');
  ['reserves', 'holdYears', 'rentGrowth', 'opexGrowth', 'closingCostsPct', 'saleCostPct'].forEach(function(k){ set(k, 'assumed', 'App default; the statement does not provide it.'); });
  return { fields:F, sum:window.bkConf.summary(F) };
}
function extract(parsed){
  var props = [];
  parsed.sheets.forEach(function(sh){ var blk = extractBlock(sh.name, sh.rows); if(blk.items.length < 5) return;
    var nm = sh.name; if(parsed.kind === 'pdf' || parsed.kind === 'csv'){ var t = (blk.title || '').split(/\s+[—–-]\s+/)[0].trim(); if(t) nm = t.replace(/\w\S*/g, function(w){ return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(); }); }
    blk.name = nm; var bp = buildProperty(blk); props.push(bp); });
  return props;
}
window.bkImportExtract = function(parsed){ return extract(parsed); };
window.bkImportDeal = dealFor;
window.bkImportParseFile = readFile;

/* ------------------------------------------------------------ sheet */
function isRes(p){ return !p.type || /resid|multi|apart/i.test(p.type); }
window.bkImportRun = async function(inp){
  var f = inp && inp.files && inp.files[0]; if(!f) return;
  S = { file:f.name, kind:'', msg:'Reading ' + f.name + '...', props:[], busy:true }; showSheet('Import Deal');
  try { var parsed = await readFile(f); S.kind = parsed.kind;
    if(parsed.unreadable){ S.msg = 'This PDF has no readable text (it is scanned, or its fonts use an encoding this reader cannot decode). Use the spreadsheet source, or export the PDF to Excel first.'; }
    else { S.props = extract(parsed).map(function(p){ return { p:p, cap:p.cap != null ? p.cap : DEFAULT_CAP, capSrc:p.cap != null ? 'source' : 'default', units:p.units }; });
      S.msg = S.props.length ? 'Found ' + S.props.length + ' propert' + (S.props.length === 1 ? 'y' : 'ies') + ' with T-12 line items in ' + f.name + '.' : 'No Yardi-format T-12 line items found in ' + f.name + ' (looked for a Section / Yardi Line Item table). Use Source Ingestion for other layouts.'; }
  } catch(e){ S.msg = 'Could not read ' + f.name + ': ' + (e && e.message || e); }
  S.busy = false; showSheet('Import Deal');
};
window.bkImportSet = function(i, k, v){ var e = S.props[i]; if(!e) return; if(k === 'cap'){ e.cap = v; e.capSrc = 'edited'; } else { e.units = v; e.unitsSrc = 'edited'; } showSheet('Import Deal'); };
window.bkImportClass = function(i, j, cat){ var e = S.props[i]; if(!e) return; var l = e.p.lines[j]; if(!l) return; if(!cat || cat === l.auto) window.bkLearn.remove(l.label); else window.bkLearn.set(l.label, cat); e.p = buildProperty(e.p.blk); showSheet('Import Deal'); };
window.bkImportCreate = function(i){ var e = S.props[i]; if(!e || !(e.cap > 0) || !(e.units > 0)) return; var d = dealFor(e.p, e.cap, e.units); window.bkConf.stamp(d, confT12(e), S.file);
  if(typeof bkCreateNewDeal === 'function') bkCreateNewDeal(d);
  if(d._imp){ var si = bkLoad(); si._imp = d._imp; bkSave(si); } if(typeof showSheet === 'function') showSheet('Home'); };
var CONF_ROWS = [['avgRent', 'Rent'], ['otherIncomePerUnit', 'Other income'], ['taxes', 'Taxes'], ['insurance', 'Insurance'], ['utilities', 'Utilities'], ['rm', 'Repairs and maintenance'], ['payroll', 'Payroll'], ['mgmtPct', 'Management fee'], ['ga', 'General and admin'], ['t12noi', 'NOI'], ['units', 'Units'], ['gsf', 'Square feet'], ['exitCap', 'Cap rate'], ['purchasePrice', 'Implied price']];
function confBlock(e, i){ var C = confT12(e), s = C.sum, F = C.fields;
  var cls = e.p.lines && e.p.lines.length ? '<details style="margin:6px 0"><summary style="cursor:pointer;font-size:12px"><b>How each expense line was classified</b> <span style="opacity:.7">(' + e.p.lines.length + ' lines; change one and it is remembered for the next import)</span></summary><table style="width:100%;border-collapse:collapse;margin-top:6px;font-size:12px"><tbody>' + e.p.lines.map(function(l, j){ var opts = window.bkLearn.options(l.auto, ['taxes', 'insurance', 'mgmt', 'utilities', 'turnover', 'payroll', 'marketing', 'rm', 'ga', 'exclude'])(l.learned ? l.group : ''); return '<tr><td style="padding:3px 6px;text-align:left">' + esc(l.label) + (l.learned ? ' <span style="font-size:10.5px;color:#12609f;font-weight:700">LEARNED</span>' : '') + '</td><td style="padding:3px 6px;text-align:right">' + $(l.amount) + '</td><td style="padding:3px 6px"><select onchange="bkImportClass(' + i + ',' + j + ',this.value)" style="font:inherit;font-size:12px">' + opts + '</select></td></tr>'; }).join('') + '</tbody></table></details>' : '';
  return '<div style="font-size:12px;margin:4px 0;display:flex;gap:14px;flex-wrap:wrap;align-items:center"><b>Confidence</b>' + ['verified', 'check', 'low', 'assumed'].map(function(k){ return window.bkConf.chip({ l:k, why:'' }, s[k] + ' ' + window.bkConf.LABEL[k].toLowerCase()); }).join('') + '</div>'
    + '<div style="font-size:12px;display:flex;gap:6px 16px;flex-wrap:wrap;margin-bottom:4px">' + CONF_ROWS.filter(function(r){ return F[r[0]]; }).map(function(r){ return '<span>' + r[1] + ' ' + window.bkConf.chip(F[r[0]]) + '</span>'; }).join('') + '</div>' + cls; }
function numInput(i, k, val, pct){ var shown = pct ? (val * 100).toFixed(2).replace(/\.?0+$/, '') : String(val); return '<input type="text" value="' + shown + '" style="width:64px;text-align:left" onchange="bkImportSet(' + i + ',\'' + k + '\',' + (pct ? '(parseFloat(this.value)||0)/100' : '(parseFloat(this.value)||0)') + ')">' + (pct ? '<span style="font-size:11px"> %</span>' : ''); }
function box(h){ return '<div style="background:var(--surface,#fff);border:1px solid var(--line,#dbe4ec);border-radius:8px;padding:14px 16px;margin-top:12px;font-size:13px;line-height:1.55;max-width:1000px">' + h + '</div>'; }
function render(){
  var body = box('<b>Upload a Yardi T-12.</b> The importer reads the line-item table (Section / Yardi Line Item / months / Reported Total) from a workbook, CSV or a PDF print of one, foots every section to the statement’s own printed totals, corrects a scanned line only when that makes a section foot, and builds the deal from the line items. Purchase price = line-item NOI / cap rate. You review every figure before a deal is created; nothing is written to an existing deal.'
    + '<div style="margin-top:10px"><input id="bkImportFile" type="file" accept=".xlsx,.xlsm,.csv,.pdf" onchange="bkImportRun(this)"></div>');
  if(S.msg) body += box((S.props.length ? '&#10003; ' : '&#9888; ') + esc(S.msg));
  if(S.props.length){
    var rows = S.props.map(function(e, i){ var p = e.p, ok = isRes(p), price = e.cap > 0 ? Math.round(p.noi / e.cap) : 0;
      var chip = p.tied ? '<span class="status-chip pass">TIES' + (Math.abs(p.gap) >= 1 ? ' \u00b7 ' + (p.gap < 0 ? '-' : '+') + $(Math.abs(p.gap)) : '') + '</span>' : (p.gap === null ? '<span class="status-chip">NO STATEMENT TOTAL</span>' : '<span class="status-chip warn">GAP ' + (p.gap < 0 ? '-' : '+') + $(Math.abs(p.gap)) + '</span>');
      var act = !ok ? '<span style="font-size:11px">Multifamily only</span>' : (!(e.units > 0) ? '<span style="font-size:11px">Enter units</span>' : '<button type="button" class="status-chip pass" onclick="bkImportCreate(' + i + ')">CREATE DEAL</button>');
      return '<tr><td class="rowlabel">' + esc(p.name) + '<div style="font-size:11px;opacity:.7">' + esc(p.type || '') + ' · ' + p.items + ' line items</div></td><td>' + numInput(i, 'units', e.units) + '</td><td>' + (p.sf ? p.sf.toLocaleString('en-US') : 'n/a') + '</td><td><b>' + $(p.noi) + '</b></td><td>' + (p.summaryNOI != null ? $(p.summaryNOI) : 'n/a') + '</td><td>' + numInput(i, 'cap', e.cap, true) + '<div style="font-size:10px;opacity:.7">' + e.capSrc + '</div></td><td>' + $(price) + '</td><td>' + chip + '</td><td>' + act + '</td></tr>'
        + '<tr><td colspan="9" style="text-align:left">' + (ok ? '<div style="font-size:12px;margin-bottom:4px"><b>Before you rely on it:</b> the T-12 has no replacement reserves, so the new deal starts at $0 (set them on Deal Underwrite); and there is no unit rent roll, so revenue uses the average rent per unit (import a rent roll for loss to lease and rollover).</div>' : '') + (ok ? confBlock(e, i) : '') + '<details><summary style="cursor:pointer;font-size:12px">' + p.flags.length + ' extraction note' + (p.flags.length === 1 ? '' : 's') + '</summary><ul style="margin:6px 0 6px 18px;font-size:12px">' + p.flags.map(function(x){ return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></details></td></tr>'; }).join('');
    body += '<div class="tbl-wrap" style="margin-top:16px"><table class="fin"><caption>Properties Extracted from ' + esc(S.file) + '</caption><thead><tr><th class="rowlabel-h">Property</th><th>Units</th><th>SF</th><th>NOI (line items)</th><th>Summary NOI</th><th>Cap rate</th><th>Implied price</th><th>Check</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>'
      + window.bkLearn.panel() + box('NOI is the sum of the line items (income less operating expenses; debt service, distributions and totals excluded). The summary-sheet figure is shown only for comparison. A missing cap rate defaults to ' + P(DEFAULT_CAP, 1) + ' (the national multifamily average on Market Benchmarks) - set your own. The new deal uses the app’s standard financing and growth assumptions; review them on Deal Underwrite.');
  }
  return { title:'Import Deal', crumbs:'Inputs', desc:'Upload a Yardi T-12 (Excel, CSV or PDF), extract the line items and create a deal.', meta:{ Source:S.file || 'none', Format:S.kind ? S.kind.toUpperCase() : 'xlsx / csv / pdf', Properties:S.props.length }, sidebar:'', main:body };
}
var g = function(){ return render(); };
if(typeof window.bkRegisterRenderer === 'function') window.bkRegisterRenderer('Import Deal', g); else RENDERERS['Import Deal'] = g;
})();
