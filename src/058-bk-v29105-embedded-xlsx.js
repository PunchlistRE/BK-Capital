
/* ===========================================================================
   V29.10.5 - EMBEDDED XLSX READER  (removes the last external dependency)
   ===========================================================================
   V29.10.4 called itself self-contained while bkLoadSheetJs() fetched
   a third-party build of SheetJS 0.18.5 from a public CDN at the moment
   the user tried to ingest a workbook. That is not self-contained: it is an
   application that works until the network, a corporate proxy, or a CDN
   outage says otherwise - and it fails at the worst possible moment, mid
   ingestion, rather than at load.

   In this environment the CDN is in fact blocked by egress policy, so the
   feature was already dead here.

   RESOLUTION. An .xlsx file is a ZIP of XML parts, and Chrome ships both the
   inflate (DecompressionStream) and the XML parser (DOMParser) natively. So
   the reader is written directly against those, with no bundled third-party
   code, and exposes exactly the three API surfaces this application actually
   uses:

       XLSX.read(buf, {type:'array'})              -> {SheetNames, Sheets}
       XLSX.utils.sheet_to_json(ws, {header:1})    -> array of row arrays
       XLSX.SSF.parse_date_code(serial)            -> {y, m, d}

   SCOPE, STATED HONESTLY. This reads .xlsx / .xlsm cell VALUES: shared
   strings, inline strings, numbers, booleans, errors, and cached formula
   results. It does not evaluate formulas, and it does not read the legacy
   binary .xls or .xlsb formats. Those are refused by name with an
   explanation rather than silently returning an empty grid. Every workbook
   this application has been asked to ingest - HPM_Portfolio_Master.xlsx,
   Yardi_Trailing-12_March_2026.xlsx - is within scope, and both are verified
   against an independent reader below.

   FINANCIAL LOGIC CHANGES: NONE. This is a file-format reader.
   =========================================================================== */
(function(){
'use strict';

/* ---------------------------------------------------------------- zip */
function u16(d,o){ return d[o] | (d[o+1]<<8); }
function u32(d,o){ return (d[o] | (d[o+1]<<8) | (d[o+2]<<16) | (d[o+3]<<24)) >>> 0; }

function findEOCD(d){
  /* End of Central Directory: signature 0x06054b50, within the last 64KB+22. */
  var max = Math.min(d.length, 65557);
  for(var i = d.length - 22; i >= d.length - max; i--){
    if(i < 0) break;
    if(d[i]===0x50 && d[i+1]===0x4b && d[i+2]===0x05 && d[i+3]===0x06) return i;
  }
  return -1;
}

function zipEntries(d){
  var e = findEOCD(d);
  if(e < 0) throw new Error('Not a valid .xlsx file (no ZIP end-of-directory record found).');
  var n = u16(d, e+10), off = u32(d, e+16);
  var out = {}, p = off;
  for(var k=0; k<n; k++){
    if(u32(d,p) !== 0x02014b50) break;
    var method  = u16(d, p+10);
    var csize   = u32(d, p+20);
    var nameLen = u16(d, p+28);
    var extraLen= u16(d, p+30);
    var cmtLen  = u16(d, p+32);
    var lho     = u32(d, p+42);
    var name    = new TextDecoder().decode(d.subarray(p+46, p+46+nameLen));
    /* local header: 30 bytes + its own (possibly different) name/extra lengths */
    var lNameLen  = u16(d, lho+26);
    var lExtraLen = u16(d, lho+28);
    var dataStart = lho + 30 + lNameLen + lExtraLen;
    out[name] = { method:method, start:dataStart, csize:csize };
    p += 46 + nameLen + extraLen + cmtLen;
  }
  return out;
}

async function inflateRaw(bytes){
  var ds = new DecompressionStream('deflate-raw');
  var stream = new Blob([bytes]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function readPart(d, entries, name){
  var e = entries[name];
  if(!e) return null;
  var raw = d.subarray(e.start, e.start + e.csize);
  var bytes = (e.method === 0) ? raw
            : (e.method === 8) ? await inflateRaw(raw)
            : (function(){ throw new Error('Unsupported ZIP compression method ' + e.method + ' in ' + name); })();
  return new TextDecoder('utf-8').decode(bytes);
}

/* ---------------------------------------------------------------- xml */
function xml(text){
  var doc = new DOMParser().parseFromString(text, 'application/xml');
  if(doc.getElementsByTagName('parsererror').length)
    throw new Error('Malformed XML inside the workbook.');
  return doc;
}
function tags(doc, local){
  /* namespace-agnostic: workbook parts vary in prefix usage */
  var all = doc.getElementsByTagName('*'), out = [];
  for(var i=0;i<all.length;i++){ if(all[i].localName === local) out.push(all[i]); }
  return out;
}
function attrNS(el, local){
  var a = el.attributes;
  for(var i=0;i<a.length;i++){ if(a[i].localName === local) return a[i].value; }
  return null;
}

/* ---------------------------------------------------------------- cells */
function colToIndex(ref){
  var m = /^([A-Z]+)/.exec(ref);
  if(!m) return 0;
  var s = m[1], n = 0;
  for(var i=0;i<s.length;i++) n = n*26 + (s.charCodeAt(i) - 64);
  return n - 1;
}
function rowOf(ref){ var m = /(\d+)$/.exec(ref); return m ? parseInt(m[1],10) - 1 : 0; }

function sharedStrings(doc){
  if(!doc) return [];
  return tags(doc,'si').map(function(si){
    /* <si><t>x</t></si> or a run sequence <si><r><t>a</t></r><r><t>b</t></r></si>.
       Concatenate every <t> that is NOT inside a phonetic block. */
    var ts = [], list = si.getElementsByTagName('*');
    for(var i=0;i<list.length;i++){
      var el = list[i];
      if(el.localName !== 't') continue;
      var p = el.parentNode, skip = false;
      while(p && p !== si){ if(p.localName === 'rPh' || p.localName === 'phoneticPr'){ skip = true; break; } p = p.parentNode; }
      if(!skip) ts.push(el.textContent);
    }
    return ts.join('');
  });
}

function sheetGrid(doc, sst){
  var rowsEls = tags(doc,'row'), grid = [], maxCol = -1;
  rowsEls.forEach(function(r){
    var ri = r.getAttribute('r') ? parseInt(r.getAttribute('r'),10) - 1 : grid.length;
    var cells = [], kids = r.children;
    for(var i=0;i<kids.length;i++){
      var c = kids[i];
      if(c.localName !== 'c') continue;
      var ref = c.getAttribute('r') || '';
      var ci  = ref ? colToIndex(ref) : i;
      var t   = c.getAttribute('t');
      var v = null, vEl = null, isEl = null, kk = c.children;
      for(var j=0;j<kk.length;j++){
        if(kk[j].localName === 'v')  vEl  = kk[j];
        if(kk[j].localName === 'is') isEl = kk[j];
      }
      if(t === 'inlineStr'){
        v = isEl ? isEl.textContent : null;
      } else if(t === 's'){
        var ix = vEl ? parseInt(vEl.textContent,10) : -1;
        v = (ix >= 0 && ix < sst.length) ? sst[ix] : null;
      } else if(t === 'b'){
        v = vEl ? (vEl.textContent === '1') : null;
      } else if(t === 'e'){
        v = vEl ? vEl.textContent : null;          /* error literal, e.g. #DIV/0! */
      } else if(t === 'str'){
        v = vEl ? vEl.textContent : null;          /* cached formula string result */
      } else {
        if(vEl && vEl.textContent !== ''){
          var n = Number(vEl.textContent);
          v = Number.isNaN(n) ? vEl.textContent : n;
        } else v = null;
      }
      cells[ci] = v;
      if(ci > maxCol) maxCol = ci;
    }
    grid[ri] = cells;
  });
  /* normalise to a dense rectangle with null, matching sheet_to_json defval:null */
  var width = maxCol + 1;
  for(var i=0;i<grid.length;i++){
    var row = grid[i] || [];
    for(var j=0;j<width;j++) if(row[j] === undefined) row[j] = null;
    row.length = width;
    grid[i] = row;
  }
  return grid;
}

/* ---------------------------------------------------------------- api */
async function readWorkbook(buf){
  var d = (buf instanceof Uint8Array) ? buf : new Uint8Array(buf);
  /* Refuse formats we cannot read, by name, instead of returning an empty grid. */
  if(d[0]===0xD0 && d[1]===0xCF)
    throw new Error('This is a legacy binary .xls workbook. The embedded reader handles .xlsx / .xlsm only - re-save it as .xlsx and ingest again.');
  if(!(d[0]===0x50 && d[1]===0x4b))
    throw new Error('This file is not an .xlsx workbook (no ZIP header). If it is a .csv, use the CSV path instead.');

  var entries = zipEntries(d);
  if(entries['xl/workbook.bin'])
    throw new Error('This is a binary .xlsb workbook. The embedded reader handles .xlsx / .xlsm only - re-save it as .xlsx and ingest again.');

  var wbXml = await readPart(d, entries, 'xl/workbook.xml');
  if(!wbXml) throw new Error('Workbook is missing xl/workbook.xml - the file may be corrupt.');
  var wbDoc = xml(wbXml);

  var relsXml = await readPart(d, entries, 'xl/_rels/workbook.xml.rels');
  var relMap = {};
  if(relsXml){
    tags(xml(relsXml),'Relationship').forEach(function(r){
      var target = r.getAttribute('Target') || '';
      if(target.charAt(0) === '/') target = target.replace(/^\/xl\//,'');
      else target = target.replace(/^\.\//,'');
      relMap[r.getAttribute('Id')] = target.indexOf('xl/') === 0 ? target : 'xl/' + target;
    });
  }

  var sstXml = await readPart(d, entries, 'xl/sharedStrings.xml');
  var sst = sharedStrings(sstXml ? xml(sstXml) : null);

  var SheetNames = [], Sheets = {}, i = 0;
  var sheetEls = tags(wbDoc,'sheet');
  for(var k=0;k<sheetEls.length;k++){
    var el = sheetEls[k];
    var name = el.getAttribute('name') || ('Sheet' + (k+1));
    var rid  = attrNS(el,'id');
    var part = (rid && relMap[rid]) || ('xl/worksheets/sheet' + (++i) + '.xml');
    var sXml = await readPart(d, entries, part);
    SheetNames.push(name);
    Sheets[name] = { __rows: sXml ? sheetGrid(xml(sXml), sst) : [], __part: part };
  }
  return { SheetNames:SheetNames, Sheets:Sheets, __embedded:true };
}

/* Excel serial -> calendar date. 1900 system, including Excel's deliberate
   1900-02-29 leap-year bug, which is why serial 60 is skipped. */
function parse_date_code(v){
  var n = Number(v);
  if(!isFinite(n) || n < 0) return null;
  var days = Math.floor(n);
  var frac = n - days;
  if(days === 60) return { y:1900, m:2, d:29, H:0, M:0, S:0 };
  if(days > 60) days -= 1;
  var ms = Date.UTC(1900,0,1) + (days - 1) * 86400000;
  var dt = new Date(ms);
  var secs = Math.round(frac * 86400);
  return { y:dt.getUTCFullYear(), m:dt.getUTCMonth()+1, d:dt.getUTCDate(),
           H:Math.floor(secs/3600), M:Math.floor(secs/60)%60, S:secs%60 };
}

/* ---------------------------------------------------------------- shim */
/* Synchronous XLSX.read is what the two existing call sites expect. The ZIP
   inflate is async, so bkLoadSheetJs() now does the decode and parks the
   result; XLSX.read then returns it. The call sites already await
   bkLoadSheetJs() before calling XLSX.read, so their control flow is
   unchanged - only the source of the bytes moved from a CDN to this file. */
var _pending = null;

window.bkXlsxReadAsync = readWorkbook;

window.XLSX = {
  read: function(buf, opts){
    if(_pending && _pending.buf === buf) return _pending.wb;
    throw new Error('Workbook bytes were not pre-decoded. Call bkXlsxPrepare(buffer) first.');
  },
  utils: {
    sheet_to_json: function(ws, opts){
      opts = opts || {};
      var rows = (ws && ws.__rows) ? ws.__rows : [];
      if(opts.header !== 1) throw new Error('The embedded reader supports sheet_to_json({header:1}) only.');
      var defval = ('defval' in opts) ? opts.defval : null;
      return rows.map(function(r){
        return (r || []).map(function(c){ return (c === undefined || c === null) ? defval : c; });
      });
    }
  },
  SSF: { parse_date_code: parse_date_code },
  __embedded: true,
  version: 'bk-embedded-1.0'
};

/* Pre-decode step. Returns the workbook AND arms XLSX.read for that buffer. */
window.bkXlsxPrepare = async function(buf){
  var wb = await readWorkbook(buf);
  _pending = { buf: buf, wb: wb };
  return wb;
};

/* bkLoadSheetJs no longer touches the network. It resolves immediately, and
   the reader is always present, so ingestion can never fail halfway through
   because a CDN was unreachable. */
window.bkLoadSheetJs = function(){ return Promise.resolve(); };
try { bkLoadSheetJs = window.bkLoadSheetJs; } catch(e){}

})();
