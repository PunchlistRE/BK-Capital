/* DOCUMENT INGESTION, intake (Phase 2). What happens to a file the moment it is added: what it REALLY is (from its bytes, not its name), a content hash, duplicate and corrupt detection, and a
   record with an audit event. Nothing is read or interpreted here; a document that will not be processed (an exact duplicate, an empty or unreadable file) is still recorded, so the history shows it.

     BKIngest.sniff(bytes, name) -> { kind, mime, ext, mismatch, warnings }       kind: pdf, xlsx, xlsm, xls, docx, doc, pptx, csv, txt, png, jpeg, gif, webp, tiff, bmp, heic, zip, ole, unknown
     BKIngest.intake(ctx, files, opts) -> Promise<{ documents, duplicates, rejected }>
         ctx = { store, blobs, dealId, actor }     blobs: where the file bytes live (BKIngest.blobs.dealDocuments() uses the existing Deal Documents store; BKIngest.blobs.memory() for tests)
         opts = { maxBytes (45 MB, the Deal Documents sync limit), force (process an exact duplicate anyway) }
   An exact duplicate (same SHA-256 in the same deal) is recorded as a duplicate and not processed again. A file whose NAME matches another's after stripping "copy", "final", "opt", "dragged", version
   numbers, but whose content differs, is flagged similar-name (advice only: the two can be different versions, or different documents). */
(function(){
'use strict';
var I = window.BKIngest = window.BKIngest || {};

/* ---------------------------------------------------------------- what a file really is */
function zipNames(u8){
  var dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), min = Math.max(0, u8.length - 65557), i;
  for(i = u8.length - 22; i >= min; i--) if(dv.getUint32(i, true) === 0x06054b50) break;
  if(i < min) return null;
  var total = dv.getUint16(i + 10, true), off = dv.getUint32(i + 16, true); if(off === 0xFFFFFFFF) return { zip64:true, names:[] };
  var names = [], p = off; for(var n = 0; n < total && p + 46 <= u8.length; n++){ if(dv.getUint32(p, true) !== 0x02014b50) break; var nl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true);
    names.push(String.fromCharCode.apply(null, u8.subarray(p + 46, p + 46 + nl))); p += 46 + nl + el + cl; }
  return { zip64:false, names:names };
}
var MIME = { pdf:'application/pdf', xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', xlsm:'application/vnd.ms-excel.sheet.macroEnabled.12', xls:'application/vnd.ms-excel', docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document', doc:'application/msword',
  pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation', csv:'text/csv', txt:'text/plain', png:'image/png', jpeg:'image/jpeg', gif:'image/gif', webp:'image/webp', tiff:'image/tiff', bmp:'image/bmp', heic:'image/heic', zip:'application/zip', ole:'application/x-ole-storage' };
var EXT = { pdf:'pdf', xlsx:'xlsx', xlsm:'xlsx', xls:'ole', csv:'csv', txt:'txt', tsv:'csv', docx:'docx', doc:'ole', pptx:'pptx', ppt:'ole', jpg:'jpeg', jpeg:'jpeg', png:'png', gif:'gif', webp:'webp', tif:'tiff', tiff:'tiff', bmp:'bmp', heic:'heic', heif:'heic', zip:'zip' };
function extOf(name){ var m = /\.([A-Za-z0-9]{1,5})$/.exec(String(name || '')); return m ? m[1].toLowerCase() : ''; }
function isText(u8){ var n = Math.min(u8.length, 8192), printable = 0; if(!n) return false; for(var i = 0; i < n; i++){ var b = u8[i]; if(b === 0) return false; if(b === 9 || b === 10 || b === 13 || (b >= 32 && b < 127) || b >= 128) printable++; } return printable / n >= 0.97; }
function delimited(u8){ var t = ''; try { t = new TextDecoder('utf-8', { fatal:false }).decode(u8.subarray(0, Math.min(u8.length, 16384))); } catch(e){ return false; } var lines = t.split(/\r?\n/).filter(function(l){ return l.trim(); }).slice(0, 12); if(lines.length < 2) return false;
  return [',', '\t', ';', '|'].some(function(d){ var c = lines.map(function(l){ return l.split(d).length - 1; }); return c[0] >= 1 && c.filter(function(x){ return x === c[0]; }).length >= Math.max(2, Math.floor(lines.length * 0.7)); }); }
I.sniff = function(u8, name){
  var out = { kind:'unknown', mime:'application/octet-stream', ext:extOf(name), mismatch:null, warnings:[] }, n = u8.length, at = function(i, a){ for(var k = 0; k < a.length; k++) if(u8[i + k] !== a[k]) return false; return true; };
  var head = n ? String.fromCharCode.apply(null, u8.subarray(0, Math.min(n, 1024))) : '';
  if(head.indexOf('%PDF-') >= 0){ out.kind = 'pdf'; var tail = String.fromCharCode.apply(null, u8.subarray(Math.max(0, n - 2048))); if(tail.indexOf('%%EOF') < 0) out.warnings.push('no %%EOF marker: the file may be truncated'); }
  else if(at(0, [0x50, 0x4B, 3, 4]) || at(0, [0x50, 0x4B, 5, 6])){ var z = zipNames(u8);
    if(!z){ out.kind = 'zip'; out.warnings.push('corrupt-zip: the archive has no central directory (the file is damaged or cut short)'); }
    else { var nm = z.names.join('|'); out.kind = /(^|\|)xl\/workbook\.xml/.test(nm) ? (/xl\/vbaProject\.bin/.test(nm) ? 'xlsm' : 'xlsx') : /(^|\|)word\/document\.xml/.test(nm) ? 'docx' : /(^|\|)ppt\/presentation\.xml/.test(nm) ? 'pptx' : 'zip'; } }
  else if(at(0, [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1])){ var e = extOf(name); out.kind = e === 'xls' ? 'xls' : e === 'doc' ? 'doc' : 'ole'; }
  else if(at(0, [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])) out.kind = 'png';
  else if(at(0, [0xFF, 0xD8, 0xFF])) out.kind = 'jpeg';
  else if(head.slice(0, 6) === 'GIF87a' || head.slice(0, 6) === 'GIF89a') out.kind = 'gif';
  else if(head.slice(0, 4) === 'RIFF' && head.slice(8, 12) === 'WEBP') out.kind = 'webp';
  else if(at(0, [0x49, 0x49, 0x2A, 0]) || at(0, [0x4D, 0x4D, 0, 0x2A])) out.kind = 'tiff';
  else if(head.slice(0, 2) === 'BM' && n > 26 && extOf(name) === 'bmp') out.kind = 'bmp';
  else if(head.slice(4, 8) === 'ftyp' && /^(heic|heix|hevc|mif1|heif)/.test(head.slice(8, 12))) out.kind = 'heic';
  else if(isText(u8)) out.kind = (extOf(name) === 'csv' || extOf(name) === 'tsv' || delimited(u8)) ? 'csv' : 'txt';
  out.mime = MIME[out.kind] || out.mime;
  var want = EXT[out.ext], same = want === out.kind || (want === 'xlsx' && (out.kind === 'xlsx' || out.kind === 'xlsm')) || (want === 'ole' && (out.kind === 'xls' || out.kind === 'doc' || out.kind === 'ole')) || (want === 'csv' && out.kind === 'txt') || (want === 'txt' && out.kind === 'csv');
  if(want && !same) out.mismatch = 'the name says .' + out.ext + ' but the content is ' + out.kind;
  return out;
};

/* ---------------------------------------------------------------- the same document under another name */
I.normName = function(name){ return String(name || '').toLowerCase().replace(/\.[a-z0-9]{1,5}$/, '').replace(/[^a-z0-9]+/g, ' ').replace(/\b(copy|dragged|final|opt|optimi[sz]ed|draft|rev|revised|updated|new|v\d+)\b/g, ' ').replace(/\s+\d{1,2}\s*$/, '').replace(/\s+/g, ' ').trim(); };

/* ---------------------------------------------------------------- where the file bytes live */
I.blobs = I.blobs || {};
I.blobs.memory = function(){ var files = {}, n = 0; return { kind:'memory', put:function(file, meta){ var id = 'm' + (++n); files[id] = { blob:file, name:file.name, type:file.type, size:file.size, meta:meta || {} }; return Promise.resolve({ fileId:id }); },
  get:function(id){ return Promise.resolve(files[id] || null); }, remove:function(id){ delete files[id]; return Promise.resolve(true); } }; };
/* the existing Deal Documents store (IndexedDB 'punchlist-docs', synced to the private bucket when signed in): the files appear in Deal Documents and sync like any other */
I.blobs.dealDocuments = function(slot){ return { kind:'deal-documents', put:function(file, meta){ if(typeof window.bkDocsAdd !== 'function') return Promise.reject(new Error('Deal Documents is not available.')); return window.bkDocsAdd(slot || 'other', file, meta && meta.dealId != null ? meta.dealId : undefined).then(function(rec){ return { fileId:rec.id }; }); },
  get:function(id){ return typeof window.bkDocsGet === 'function' ? window.bkDocsGet(id).then(function(r){ return r ? { blob:r.blob, name:r.name, type:r.type, size:r.size } : null; }) : Promise.resolve(null); }, remove:function(id){ return typeof window.bkDocsRemove === 'function' ? window.bkDocsRemove(id) : Promise.resolve(false); } }; };

/* ---------------------------------------------------------------- intake */
I.intake = function(ctx, files, opts){
  opts = opts || {}; var max = opts.maxBytes == null ? 45 * 1048576 : opts.maxBytes, actor = ctx.actor || 'user', out = { documents:[], duplicates:[], rejected:[] };
  var list = Array.prototype.slice.call(files || []);
  function ev(doc, type, detail){ return ctx.store.appendEvent({ dealId:ctx.dealId, documentId:doc.id, stage:'intake', type:type, detail:detail || {}, actor:actor }); }
  function one(file){
    return file.arrayBuffer().then(function(buf){ return new Uint8Array(buf); }, function(){ return null; }).then(function(u8){
      var rec = { id:I.newId('doc'), seq:(I._intakeSeq = (I._intakeSeq || 0) + 1), dealId:ctx.dealId, name:file.name || 'unnamed', size:file.size, mime:file.type || '', kind:'unknown', ext:extOf(file.name), sha256:null, fileId:null, receivedAt:I.clock(), receivedBy:actor, lastModified:file.lastModified || null,
        status:'received', rejectReason:null, flags:[], duplicateOf:null, similarTo:[], docType:null, period:null, propertyKey:null, pageCount:null, stages:null };
      var reject = function(code, message){ rec.status = 'rejected'; rec.rejectReason = code; rec.flags.push({ code:code, detail:message }); rec.stages = I.freshStages('rejected: ' + message); return ctx.store.putDocument(rec).then(function(){ return ev(rec, 'rejected', { reason:code, message:message, name:rec.name, size:rec.size }); }).then(function(){ out.rejected.push(rec); out.documents.push(rec); }); };
      if(!u8) return reject('unreadable', 'The file could not be read.');
      if(!u8.length) return reject('empty', 'The file is empty.');
      var sn = I.sniff(u8, file.name); rec.kind = sn.kind; rec.mime = sn.mime; sn.warnings.forEach(function(w){ rec.flags.push({ code:/^corrupt-zip/.test(w) ? 'corrupt-zip' : 'warning', detail:w }); }); if(sn.mismatch) rec.flags.push({ code:'extension-mismatch', detail:sn.mismatch });
      return I.sha256(u8).then(function(sha){
        rec.sha256 = sha;
        if(u8.length > max) return reject('too-large', 'The file is ' + Math.round(u8.length / 1048576) + ' MB; the limit is ' + Math.round(max / 1048576) + ' MB.');
        if(rec.flags.some(function(f){ return f.code === 'corrupt-zip'; })) return reject('corrupt', 'The file is damaged: ' + rec.flags.filter(function(f){ return f.code === 'corrupt-zip'; })[0].detail);
        if(sn.kind === 'zip') return reject('unsupported-type', 'Zip archives are not opened yet; add the documents inside it.');
        if(sn.kind === 'unknown' || sn.kind === 'ole' && !/^(xls|doc|ppt)$/.test(rec.ext)) return reject('unsupported-type', 'This kind of file is not one the ingestion reads.');
        return ctx.store.listDocuments({ dealId:ctx.dealId }).then(function(existing){
          var dupe = existing.filter(function(d){ return d.sha256 === sha && d.status !== 'rejected'; })[0];
          if(dupe && !opts.force){ rec.status = 'duplicate'; rec.duplicateOf = dupe.id; rec.fileId = dupe.fileId; rec.docType = dupe.docType; rec.flags.push({ code:'duplicate', detail:'Identical to "' + dupe.name + '", already added.' }); rec.stages = I.freshStages('duplicate of ' + dupe.name);
            return ctx.store.putDocument(rec).then(function(){ return ev(rec, 'duplicate', { of:dupe.id, ofName:dupe.name, sha256:sha }); }).then(function(){ out.duplicates.push(rec); out.documents.push(rec); }); }
          var nn = I.normName(file.name); rec.similarTo = existing.filter(function(d){ return d.sha256 !== sha && d.status !== 'rejected' && I.normName(d.name) === nn && nn; }).map(function(d){ return d.id; });
          if(rec.similarTo.length) rec.flags.push({ code:'similar-name', detail:'The name matches ' + rec.similarTo.length + ' other document' + (rec.similarTo.length === 1 ? '' : 's') + ' but the content differs: a different version, or a different document.' });
          rec.stages = I.freshStages();
          return ctx.blobs.put(file, { dealId:ctx.dealId }).then(function(b){ rec.fileId = b.fileId; return ctx.store.putDocument(rec); }, function(err){ rec.flags.push({ code:'not-stored', detail:'The file could not be saved: ' + String(err && err.message || err) }); rec.fileId = null; return ctx.store.putDocument(rec); })
            .then(function(){ return ev(rec, 'intake', { name:rec.name, size:rec.size, kind:rec.kind, sha256:sha, flags:rec.flags.map(function(f){ return f.code; }) }); }).then(function(){ out.documents.push(rec); }); }); });
    });
  }
  return list.reduce(function(p, f){ return p.then(function(){ return one(f); }); }, Promise.resolve()).then(function(){ return out; });
};
})();
