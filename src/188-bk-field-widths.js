/* FIELD WIDTHS. One width per kind of value box, on every page: every percent box is as wide as every other percent box, every dollar amount as wide as every other dollar amount (inputs, choices and calculated read-only values alike), text as text. A page that draws its own boxes gets the same treatment because the kind is read from the box itself: the handler that saves it, the unit written beside it, the heading above it, the value in it.
   Display only. This sets one attribute (data-bk-w: s, m, l or c) that src/189 sizes. No value, handler or figure is touched. A box that is meant to be long (a question, a note, a task name) is left alone, and a page can opt a box out with data-bk-w="free". */
(function(){
'use strict';
if(typeof window.bkDisplayPass !== 'function') return;
var SEL = 'input:not([type=checkbox]):not([type=radio]):not([type=hidden]):not([type=file]):not([type=range]):not([type=color]):not([type=button]):not([type=submit]):not([type=image]):not([type=password]),select,span.ae-ro';
var SKIP = '.bk-flow,.bk-ribbon,.tabnav,.brand-bar,#pl-palette,.pl-search,.bk-ask,#bk-kpibar,[data-bk-w="free"],.bk-nofield,table.fin';   /* table.fin: its input cells are the boxes and are sized by the cell authority (src/110) */
var HANDLER = /bkEdSet\('[^']*','(pct|int|num|text|month)'/, KIND = { pct:'s', int:'s', num:'m', month:'m', text:'l' };
var H_DATE = /\b(date|start|expir\w*|ending|begin|closing)\b/i, H_PCT = /%|growth|vacanc|bump|share|yield|ltv|dscr|probab|escalat|inflation|concession|occupan|haircut|spread|margin|loss to lease|credit loss|bad debt/i,
    H_TXT = /\b(name|tenant|suite|description|label|notes?|memo|comment|address|source|title|item|line|property|city)\b/i, H_USD = /\$|rent|amount|cost|price|total|fee|income|expense|balance|payment|proceeds|equity|loan|value|noi|cash|budget|reserve|tax|insurance|capex|charge/i;
var U_AREA = /^(g?sf\b|gsf|sq|acres?|ft\b)/i, U_COUNT = /^(units?|suites?|spaces?|years?|yrs?|months?|mos?\b|rows?|stories|floors|beds|tenants|leases)/i, DATEPAT = /^(\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{2}-\d{2}|[A-Za-z]{3,9}\.?,? \d{4})$/;
function txt(n){ return n ? String(n.textContent || '').replace(/\s+/g, ' ').trim() : ''; }
function unitText(el){ var n = el.nextElementSibling; return n && /\bae-unit\b/.test(n.className || '') ? txt(n) : ''; }
function labelText(el){ var d = el.parentElement, l = d && d.previousElementSibling; return l && l.tagName === 'LABEL' ? txt(l) : ''; }
function headText(el){ var td = el.closest('td'); if(!td) return ''; var tb = td.closest('table'), rows = tb ? tb.querySelectorAll('thead tr') : [], last = rows.length ? rows[rows.length - 1] : null; if(!last) return '';
  var idx = Array.prototype.indexOf.call(td.parentNode.children, td), cells = last.children; return cells.length === td.parentNode.children.length ? txt(cells[idx]) : ''; }
function hint(h, text){ if(!h) return null; if(H_DATE.test(h)) return 'm'; if(H_PCT.test(h)) return 's'; if(text && H_TXT.test(h)) return 'l'; if(H_USD.test(h)) return 'm'; return null; }
function kindOf(el){
  var tag = el.tagName;
  if(tag === 'SELECT'){ if(el.closest('.ae-form')) return 'c'; var m = 0; for(var i = 0; i < el.options.length; i++) m = Math.max(m, (el.options[i].text || '').length); return m <= 14 ? 'm' : 'c'; }
  var t = String(el.getAttribute('type') || 'text').toLowerCase(); if(t === 'date' || t === 'month') return 'm';
  var v = tag === 'INPUT' ? el.value : txt(el), s = String(v || el.getAttribute('placeholder') || '').trim(), u = unitText(el);
  if(DATEPAT.test(s) || /^m\/d\/y/i.test(s)) return 'm';
  var h = HANDLER.exec(String(el.getAttribute('onchange') || '') + String(el.getAttribute('oninput') || '')); if(h) return KIND[h[1]];
  if(/%\s*$/.test(s) || /^%/.test(u)) return 's';
  if(/^\(?-?\s*\$/.test(s) || /^\$/.test(u)) return 'm';
  if(U_AREA.test(u)) return 'm';
  if(U_COUNT.test(u)) return 's';
  var k = hint(headText(el), true) || hint(u, false) || ((s === '' || s === '-' || s === '–') ? hint(labelText(el), false) : null); if(k) return k;
  if(DATEPAT.test(s)) return 'm';
  if(/^[\s\d,.\-+\/−()x]*$/.test(s)) return /^\d{1,3}$/.test(s) ? 's' : 'm';
  return 'l';
}
function put(el, a, v){ if(el.getAttribute(a) !== v) el.setAttribute(a, v); }
function mark(el, k){
  put(el, 'data-bk-w', k);
  var td = el.parentElement; if(td && td.tagName === 'TD' && td.children.length === 1){ put(td, 'data-bk-wc', k); var tb = td.closest('table'); if(tb && /\bae-grid\b/.test(tb.className || '')) put(tb, 'data-bk-fit', '1'); }
}
function run(){
  var vp = document.getElementById('viewport'); if(!vp) return;
  vp.querySelectorAll(SEL).forEach(function(el){
    if(el.hasAttribute('data-bk-w') && el.getAttribute('data-bk-w') !== 'free'){ mark(el, el.getAttribute('data-bk-w')); return; }   /* a page that names the kind itself keeps it */
    if(el.closest(SKIP)) return;
    var r = el.getBoundingClientRect(); if(r.width < 2) return;          /* not shown yet: classified when it is */
    if(r.width > 340 && el.tagName === 'INPUT' && !el.closest('.ae-form,.ae-grid')) return;   /* a long box on purpose (a question, a note, a task name) */
    var k; try { k = kindOf(el); } catch(e){ k = null; } if(k) mark(el, k);
  });
}
var q = false; function schedule(){ if(q) return; q = true; requestAnimationFrame(function(){ q = false; try { run(); } catch(e){} }); }
window.bkDisplayPass(schedule); window.bkFieldWidths = run;
document.addEventListener('focusin', function(e){ var el = e.target; if(el && el.matches && el.matches(SEL) && !el.hasAttribute('data-bk-w')) schedule(); });
})();
