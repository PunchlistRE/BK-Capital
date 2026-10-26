
/* Import confidence and learning, shared by every importer (OM, T-12, rent roll).
   Confidence: each imported figure carries a level and a one-line reason.
     verified = reconciled against another number in the document; check = read directly with nothing to corroborate it;
     low = does not reconcile or is missing; assumed = the app's default, not from the document.
   Learning: when you reclassify an expense line the importer remembers the label, so the same wording is classified your way next time (kept in this browser). */
(function(){
'use strict';
var LABEL = { verified:'Verified', check:'Check', low:'Low', assumed:'Assumed' }, COLOR = { verified:'#1F7A45', check:'#8A6212', low:'#B23A2C', assumed:'#566a80' };
function esc(v){ return String(v == null ? '' : v).replace(/[&<>"]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
function box(h){ return '<div style="background:var(--surface,#fff);border:1px solid var(--line,#dbe4ec);border-radius:8px;padding:14px 16px;margin-top:12px;font-size:13px;line-height:1.55;max-width:1000px">' + h + '</div>'; }
function summary(F){ var c = { verified:0, check:0, low:0, assumed:0 }; Object.keys(F).forEach(function(k){ if(c[F[k].l] != null) c[F[k].l]++; }); return c; }
function chip(c, text){ if(!c) return ''; var col = COLOR[c.l]; return '<span title="' + esc(c.why) + '" style="display:inline-flex;align-items:center;gap:5px;font-size:10.5px;font-weight:700;letter-spacing:.04em;color:' + col + '"><i style="width:8px;height:8px;border-radius:1px;background:' + col + ';display:inline-block"></i>' + (text || LABEL[c.l]) + '</span>'; }
function bar(C, what){ var s = C.sum || summary(C.fields);
  return box('<div style="display:flex;gap:16px;flex-wrap:wrap;align-items:center"><b>Confidence in what was read</b>' + ['verified', 'check', 'low', 'assumed'].map(function(k){ return chip({ l:k, why:'' }, s[k] + ' ' + LABEL[k].toLowerCase()); }).join('') + '</div>'
    + '<div style="font-size:12px;opacity:.75;margin-top:6px">Verified figures reconcile with another number in the ' + (what || 'document') + '. Check means read directly with nothing to corroborate it. ' + (s.low ? '<b style="color:#B23A2C">' + s.low + ' figure' + (s.low > 1 ? 's' : '') + ' did not reconcile or ' + (s.low > 1 ? 'were' : 'was') + ' not found. Look at the rows marked Low before relying on this.</b> ' : '') + 'Hover a label for the reason. Flagged figures stay marked in the Guide until you confirm them.</div>'); }
function stamp(deal, C, source){ deal._imp = { source:String(source || ''), at:new Date().toISOString().slice(0, 10), fields:{} }; Object.keys(C.fields).forEach(function(k){ var f = C.fields[k]; if(f.l === 'low' || f.l === 'check') deal._imp.fields[k] = { l:f.l, why:f.why }; }); return deal; }
window.bkConf = { LABEL:LABEL, chip:chip, bar:bar, box:box, summary:summary, stamp:stamp, esc:esc };

/* ---- learning ---- */
var RK = 'bkcapital.learn.rules.v1', LK = 'bkcapital.learn.log.v1';
function load(k, d){ try { var v = JSON.parse(localStorage.getItem(k) || 'null'); return v == null ? d : v; } catch(e){ return d; } }
function save(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch(e){} }
function norm(l){ return String(l || '').toLowerCase().replace(/[^a-z& ]+/g, ' ').replace(/\s+/g, ' ').trim(); }
var CATS = { mgmt:'Management fee', taxes:'Real estate taxes', insurance:'Insurance', utilities:'Utilities', rm:'Repairs and maintenance', contract:'Contract services', payroll:'Payroll', marketing:'Marketing', turnover:'Turnover', ga:'General and admin', exclude:'Not an operating expense (leave out)' };
window.bkLearn = {
  CATS:CATS, norm:norm,
  get:function(label){ var r = load(RK, {})[norm(label)]; return r && CATS[r.cat] ? r.cat : null; },
  set:function(label, cat){ var n = norm(label); if(!n || !CATS[cat]) return; var r = load(RK, {}); r[n] = { cat:cat, label:String(label).slice(0, 80), at:new Date().toISOString().slice(0, 10) }; save(RK, r); this.log({ kind:'class', field:String(label).slice(0, 80), now:cat }); },
  remove:function(label){ var r = load(RK, {}); delete r[norm(label)]; save(RK, r); },
  all:function(){ return load(RK, {}); },
  log:function(e){ var l = load(LK, []); e.at = new Date().toISOString().slice(0, 10); l.push(e); save(LK, l.slice(-200)); },
  logAll:function(){ return load(LK, []); },
  clear:function(){ try { localStorage.removeItem(RK); localStorage.removeItem(LK); } catch(e){} },
  options:function(autoCat, allowed){ var o = '<option value="">Automatic' + (autoCat ? ' (' + esc(CATS[autoCat] || autoCat) + ')' : '') + '</option>'; return function(cur){ return o + (allowed || Object.keys(CATS)).map(function(k){ return '<option value="' + k + '"' + (cur === k ? ' selected' : '') + '>' + esc(CATS[k]) + '</option>'; }).join(''); }; },
  panel:function(){ var n = Object.keys(load(RK, {})).length, m = load(LK, []).filter(function(e){ return e.kind === 'fix'; }).length; if(!n && !m) return '';
    return box('<b>What the importer has learned here</b> <span style="opacity:.75">' + n + ' expense wording' + (n === 1 ? '' : 's') + ' classified your way' + (m ? ', ' + m + ' figure correction' + (m === 1 ? '' : 's') + ' noted' : '') + '. It applies them to every later import in this browser.</span> <button type="button" class="pl-hbtn" style="margin-left:8px" onclick="if(confirm(\'Forget everything the importer has learned from your corrections?\')){bkLearn.clear();showSheet(currentSheet)}">Forget</button>'); }
};
})();
