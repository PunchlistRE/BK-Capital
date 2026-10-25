
/* V30 - single guard for every display-normalisation pass: never rewrite the
   text of a cell the user is actively typing into. Writing textContent/nodeValue
   on a focused contenteditable resets the caret to position 0, which reversed
   every typed value ("T-100" -> "001-T"). Display-only; no stored value touched. */
window.bkIsEditing=function(node){
  var a=document.activeElement;
  if(!a || !a.isContentEditable || !node) return false;
  return a===node || a.contains(node) || (node.nodeType===1 && node.contains(a));
};
