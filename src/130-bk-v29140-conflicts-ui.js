
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
    return '<tr' + (c.acknowledged ? ' style="opacity:.6"' : '') + '><td class="rowlabel" style="vertical-align:top">' + chip(cls, c.level) + '<div style="margin-top:4px;font-size:11px">' + esc(c.area) + '</div></td>'
      + '<td data-bk-align="text" style="vertical-align:top"><b>' + esc(c.message) + '</b><div style="margin-top:6px;font-size:12px;color:#555"><b>Why it matters.</b> ' + esc(c.why) + '</div></td>'
      + '<td style="vertical-align:top"><a href="#" onclick="showSheet(\'' + c.sheet + '\');return false">' + esc(c.sheet) + '</a></td><td style="vertical-align:top">' + act + (c.acknowledged ? '<div style="font-size:11px">acknowledged</div>' : '') + '</td></tr>';
  }).join('') || '<tr><td class="rowlabel" colspan="4">No conflicting inputs found.</td></tr>';
  var main = '<div class="tbl-wrap"><table class="fin"><caption>Conflicting Inputs and Their Consequences</caption><thead><tr><th class="rowlabel-h">Severity</th><th style="text-align:left">Finding and why it matters</th><th>Fix on</th><th>Action</th></tr></thead><tbody>' + rows + '</tbody></table></div>'
    + '<div class="note-flag" style="margin-top:12px"><span>&#9432;</span><div><b>How to read this.</b> <b>ERROR</b>: the inputs contradict each other or are impossible, so results are wrong; the deal is not decision-grade until fixed. <b>WARN</b>: calculable, but likely to disagree with a lender, a tax return, a JV agreement or another figure in the model - acknowledge it once you have decided it is intended. <b>INFO</b>: an assumption worth stating. These checks compare inputs and engine outputs; they never change a number. A card appears whenever an edit creates a new ERROR or WARN.</div></div>';
  var side = (typeof sidebarShell === 'function') ? sidebarShell('<div class="card"><div class="card-head">Model Checks</div><div class="metric-list"><div class="metric-row"><span class="k">Errors</span><span class="v">' + n.ERROR + '</span></div><div class="metric-row"><span class="k">Warnings</span><span class="v">' + n.WARN + '</span></div><div class="metric-row"><span class="k">Notes</span><span class="v">' + n.INFO + '</span></div><div class="metric-row"><span class="k">Rules</span><span class="v">' + window.BK_CONFLICT_RULES.length + '</span></div></div></div>' + (typeof colorKeyCard === 'function' ? colorKeyCard() : '')) : '';
  return { title:'Model Checks', crumbs:'Credit & IC', desc:'Combinations of inputs that contradict each other or quietly create an accounting, tax or credit discrepancy.',
    meta:{ Property:s.name, Errors:n.ERROR, Warnings:n.WARN }, main:main, sidebar:side };
};
if(typeof window.bkRegisterRenderer === 'function') window.bkRegisterRenderer('Model Checks', render); else RENDERERS['Model Checks'] = render;
})();
