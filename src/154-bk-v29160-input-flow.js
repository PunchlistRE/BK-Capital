
/* ===========================================================================
   V29.16.0 - INPUT FLOW: keep scroll and focus, and move between inputs with the arrow keys
   ===========================================================================
   PROBLEM (reproduced): leaving a cell re-renders the whole sheet (showSheet(currentSheet)) so the
   value commits and every derived row refreshes. Clicking from one cell to another therefore threw the
   page back to the top and dropped focus, every time.

   FIX, as a final wrapper around showSheet so it covers every sheet:
   * re-rendering the SAME sheet restores the scroll position of the page and of every scroll container
   * the cell you were heading for is re-focused after the re-render (found by position and row label)
   * Arrow Down / Arrow Up commit the current input and move to the next / previous one. Entering a new
     section scrolls that section to the top of the view and focuses its first input, so the next section
     "pops up". Selects keep their own arrow-key behaviour; Enter and Escape are unchanged.
   =========================================================================== */
(function(){
'use strict';
if(typeof showSheet !== 'function') return;
var HEADER = 92;                       /* px kept clear above a section brought to the top */
var SEL = '#viewport tr.input td.v, #viewport td.v[contenteditable="true"], #viewport input[type="text"]';

function scrollers(){ var out = [], v = document.getElementById('viewport'); for(var e = v; e; e = e.parentElement) out.push(e); out.push(document.scrollingElement || document.documentElement); return out; }
function snap(){ return { x:window.scrollX, y:window.scrollY, els:scrollers().map(function(e){ return [e, e.scrollTop, e.scrollLeft]; }) }; }
function restore(s){ s.els.forEach(function(a){ a[0].scrollTop = a[1]; a[0].scrollLeft = a[2]; }); window.scrollTo(s.x, s.y); }

function visible(el){ return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length); }
function editables(){
  var seen = [], out = [];
  [].slice.call(document.querySelectorAll(SEL)).forEach(function(el){
    if(seen.indexOf(el) >= 0 || !visible(el)) return; seen.push(el);
    if(el.tagName === 'INPUT' || el.isContentEditable || el.getAttribute('contenteditable') === 'true' || el.matches('tr.input td.v')) out.push(el);
  });
  return out;
}
function labelOf(el){ var tr = el.closest('tr'); var l = tr && (tr.querySelector('.rowlabel') || tr.cells[0]); return (l ? l.textContent : '').trim() + '|' + (el.cellIndex != null ? el.cellIndex : ''); }
function sectionOf(el){ return el.closest('.tbl-wrap') || el.closest('table'); }
/* every control that can hold focus, including dropdowns (used only to hand focus back after a re-render) */
function focusables(){ return [].slice.call(document.querySelectorAll(SEL + ', #viewport select')).filter(visible); }

function bringIntoView(el, newSection){
  var sec = sectionOf(el);
  if(newSection && sec){ var top = sec.getBoundingClientRect().top + window.scrollY - HEADER; window.scrollTo(window.scrollX, Math.max(0, top)); return; }
  var r = el.getBoundingClientRect(), h = window.innerHeight;
  if(r.top < HEADER || r.bottom > h - 24) window.scrollTo(window.scrollX, Math.max(0, r.top + window.scrollY - h / 2));
}
function focusEl(el){
  try { el.focus({ preventScroll:true }); } catch(e){ el.focus(); }
  if(el.tagName === 'INPUT') { try { el.select(); } catch(e){} }
}
/* after a re-render: put focus back on the cell the user was heading for */
function applyPending(){
  var p = window.__bkPending; if(!p) return; window.__bkPending = null;
  var list = p.all ? focusables() : editables(), el = list[p.ord];
  if(!el || labelOf(el) !== p.label) el = list.filter(function(x){ return labelOf(x) === p.label; })[0] || el;
  if(!el) return;
  focusEl(el); bringIntoView(el, p.newSection);
}

var prev = window.showSheet, busy = false, again = null;
var wrapped = function(sheet){
  /* Re-entrancy: replacing the viewport removes a focused cell, the browser blurs it DURING the replacement, and the cell's blur handler calls
     showSheet again - a nested innerHTML write that throws. The nested request is coalesced and re-run once the outer render has finished
     (its value was already committed by the handler, so the final render shows it). */
  if(busy){ again = sheet; return; }
  var same = (typeof currentSheet !== 'undefined') && sheet === currentSheet;
  var s = same ? snap() : null, r;
  busy = true; try { r = prev.apply(this, arguments); } finally { busy = false; }
  if(s){ restore(s); requestAnimationFrame(function(){ restore(s); }); setTimeout(function(){ restore(s); applyPending(); }, 25); }
  else if(window.__bkPending){ setTimeout(applyPending, 25); }
  if(again !== null){ var nxt = again; again = null; setTimeout(function(){ wrapped(nxt); }, 0); }
  return r;
};
window.showSheet = wrapped; try { showSheet = wrapped; } catch(e){}

/* clicking from one cell to another: remember the target so the re-render hands focus back to it */
document.addEventListener('mousedown', function(e){
  var t = e.target && e.target.closest ? e.target.closest(SEL) : null; if(!t) return;
  var a = document.activeElement; if(!a || a === t || !a.closest || !a.closest('#viewport')) return;
  var list = editables(), i = list.indexOf(t); if(i < 0) return;
  window.__bkPending = { ord:i, label:labelOf(t), newSection:false };
  setTimeout(function(){ if(window.__bkPending && window.__bkPending.ord === i) applyPending(); }, 120);     /* nothing re-rendered: the click already focused it */
}, true);

/* a dropdown change re-renders the sheet, which replaces the dropdown: hand focus back so it can be changed again */
document.addEventListener('change', function(e){
  var t = e.target; if(!t || t.tagName !== 'SELECT' || !t.closest || !t.closest('#viewport')) return;
  var list = focusables(), i = list.indexOf(t); if(i < 0) return;
  window.__bkPending = { ord:i, label:labelOf(t), newSection:false, all:true };
  setTimeout(function(){ if(window.__bkPending && window.__bkPending.ord === i && window.__bkPending.all) applyPending(); }, 150);
}, true);

/* Arrow Down / Up move between inputs; a new section is brought to the top */
document.addEventListener('keydown', function(e){
  if(e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
  if(e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
  var t = e.target; if(!t || !t.closest || !t.closest('#viewport') || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA') return;
  var isCell = t.tagName === 'TD' && (t.isContentEditable || t.matches('tr.input td.v')), isInput = t.tagName === 'INPUT' && (t.type === 'text' || !t.type);
  if(!isCell && !isInput) return;
  var list = editables(), i = list.indexOf(t); if(i < 0) return;
  var j = i + (e.key === 'ArrowDown' ? 1 : -1); if(j < 0 || j >= list.length) return;
  e.preventDefault();
  var nxt = list[j];
  window.__bkPending = { ord:j, label:labelOf(nxt), newSection:sectionOf(nxt) !== sectionOf(t) };
  t.blur();                                                           /* commits the value; the cell's own handler may re-render the sheet */
  setTimeout(function(){ if(window.__bkPending && window.__bkPending.ord === j) applyPending(); }, 80);   /* no re-render happened: move now */
}, true);

window.bkInputFlow = { editables:editables, snap:snap, restore:restore };
})();
