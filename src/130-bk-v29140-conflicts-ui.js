
/* V29.14.0 - MODEL CHECKS sheet: every conflicting-input rule that fires, with why and where to fix it. Presentation only. */
(function(){
'use strict';
if(typeof RENDERERS === 'undefined' || typeof window.bkConflicts !== 'function') return;
function esc(v){ return String(v == null ? '' : v).replace(/[&<>"]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
function chip(cls, t){ return '<span class="status-chip ' + cls + '">' + t + '</span>'; }
var render = function(){
  if(typeof window.bkHasActiveDeal === 'function' && !window.bkHasActiveDeal() && typeof window.bkEmptyState === 'function') return window.bkEmptyState('Model Checks');
  var s = bkLoad(), list = window.bkConflicts(), n = { ERROR:0, WARN:0, INFO:0 };
  list.forEach(function(c){ if(!c.acknowledged || c.level === 'ERROR') n[c.level]++; });
  var rows = list.map(function(c){
    var cls = c.level === 'ERROR' ? 'fail' : c.level === 'WARN' ? 'warn' : '';
    var act = (c.level !== 'ERROR')
      ? (c.acknowledged ? '<button type="button" class="status-chip" onclick="bkAckConflict(\'' + c.id + '\',false)">UNDO ACK</button>' : '<button type="button" class="status-chip" onclick="bkAckConflict(\'' + c.id + '\')">ACKNOWLEDGE</button>') : '';
    return '<tr' + (c.acknowledged ? ' style="opacity:.6"' : '') + '><td data-bk-align="text" style="vertical-align:middle"><b>' + esc(c.message) + '</b><div style="margin-top:6px;font-size:12px;color:#555"><b>Why it matters.</b> ' + esc(c.why) + '</div><div style="margin-top:4px;font-size:11px;color:#555">' + esc(c.area) + '</div></td>'
      + '<td style="vertical-align:middle"><a href="#" onclick="showSheet(\'' + c.sheet + '\');return false">' + esc(c.sheet) + '</a></td><td style="vertical-align:middle;text-align:center">' + act + (c.acknowledged ? '<div style="font-size:11px">acknowledged</div>' : '') + '</td>'
      + '<td class="bk-col-chip" style="vertical-align:middle;text-align:center">' + chip(cls, c.level) + '</td></tr>';
  }).join('') || '<tr><td class="rowlabel" colspan="4">No conflicting inputs found.</td></tr>';
  var main = '<div class="tbl-wrap"><table class="fin bk-mc"><caption>Conflicting Inputs and Their Consequences</caption><thead><tr><th class="rowlabel-h">Finding and why it matters</th><th style="text-align:left">Fix on</th><th style="text-align:center">Action</th><th style="text-align:center">Severity</th></tr></thead><tbody>' + rows + '</tbody></table></div>'
    + '<div class="note-flag" style="margin-top:12px"><span>&#9432;</span><div><b>How to read this.</b> <b>ERROR</b>: the inputs contradict each other or are impossible, so results are wrong; the deal is not decision-grade until fixed. <b>WARN</b>: calculable, but likely to disagree with a lender, a tax return, a JV agreement or another figure in the model - acknowledge it once you have decided it is intended. <b>INFO</b>: an assumption worth stating. These checks compare inputs and engine outputs; they never change a number. A card appears whenever an edit creates a new ERROR or WARN.</div></div>';
  /* the engine's own arithmetic, recomputed independently (src/178): failed checks, warnings and checks that do not apply are kept apart */
  var ig = typeof window.bkIntegrity === 'function' ? window.bkIntegrity() : null;
  if(ig){
    var irow = ig.checks.map(function(c){ var k = c.status === 'hard' ? 'fail' : c.status === 'warn' ? 'warn' : c.status === 'pass' ? 'pass' : '', lab = c.status === 'hard' ? 'FAILED' : c.status === 'warn' ? 'WARNING' : c.status === 'na' ? 'N/A' : 'PASS';
      return '<tr' + (c.status === 'na' ? ' style="opacity:.6"' : '') + '><td data-bk-align="text" style="vertical-align:middle"><b>' + esc(c.label) + '</b><div style="margin-top:4px;font-size:12px;color:#555">' + esc(c.detail) + '</div><div style="margin-top:3px;font-size:11px;color:#777">' + esc(c.group) + '</div></td><td class="bk-col-chip" style="vertical-align:middle;text-align:center">' + chip(k, lab) + '</td></tr>'; }).join('');
    main += '<div class="tbl-wrap" style="margin-top:16px"><table class="fin bk-mc"><caption>Calculation Integrity - recomputed independently (' + esc(ig.text) + ')</caption><thead><tr><th class="rowlabel-h">Check and what it found</th><th style="text-align:center">Result</th></tr></thead><tbody>' + irow + '</tbody></table></div>'
      + '<div class="note-flag" style="margin-top:12px"><span>&#9432;</span><div><b>How to read this.</b> <b>FAILED</b>: a result does not tie to its inputs, so it must not be relied on and the credit gate is held. <b>WARNING</b>: the figures tie, but something material is true that a reader must know. <b>N/A</b>: the check does not apply to this deal. These checks never change a number.</div></div>';
    n.ERROR += ig.hard.length; n.WARN += ig.warn.length;
  }
  var side = (typeof sidebarShell === 'function') ? sidebarShell('<div class="card"><div class="card-head">Model Checks</div><div class="metric-list"><div class="metric-row"><span class="k">Errors</span><span class="v">' + n.ERROR + '</span></div><div class="metric-row"><span class="k">Warnings</span><span class="v">' + n.WARN + '</span></div><div class="metric-row"><span class="k">Notes</span><span class="v">' + n.INFO + '</span></div><div class="metric-row"><span class="k">Rules</span><span class="v">' + window.BK_CONFLICT_RULES.length + '</span></div></div></div>' + (typeof colorKeyCard === 'function' ? colorKeyCard() : '')) : '';
  return { title:'Model Checks', crumbs:'Credit & IC', desc:'Combinations of inputs that contradict each other or quietly create an accounting, tax or credit discrepancy.',
    meta:{ Property:s.name, Errors:n.ERROR, Warnings:n.WARN }, main:main, sidebar:side };
};
if(typeof window.bkRegisterRenderer === 'function') window.bkRegisterRenderer('Model Checks', render); else RENDERERS['Model Checks'] = render;
})();
