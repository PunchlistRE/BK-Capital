
/* The methodology (conventions) table is added to Deal Underwrite by a late layer, so it is moved to the end here, after every layer that touches the sheet. Done in the page markup itself
   (not with CSS), so the keyboard order, the focus restore and what you see all stay the same. */
(function(){
'use strict';
if(typeof RENDERERS === 'undefined' || typeof RENDERERS['Deal Underwrite'] !== 'function') return;
function moveConventions(h){
  var cap = '<caption>Underwriting Conventions</caption>', i = h.indexOf(cap); if(i < 0) return h;
  var s0 = h.lastIndexOf('<div class="tbl-wrap"', i), end = '</table></div>', e = h.indexOf(end, i); if(s0 < 0 || e < 0) return h; e += end.length;
  var block = h.slice(s0, e); return h.slice(0, s0) + h.slice(e) + '<div style="height:16px"></div>' + block;
}
var prevDU = RENDERERS['Deal Underwrite'];
RENDERERS['Deal Underwrite'] = function(){ var o = prevDU.apply(this, arguments); if(o && typeof o.main === 'string') o.main = moveConventions(o.main); return o; };
if(typeof window.bkRegisterRenderer === 'function') try { window.bkRegisterRenderer('Deal Underwrite', RENDERERS['Deal Underwrite']); } catch(e){}
})();
