
/* Contenteditable TDs can inherit numeric/right-aligned behavior from the financial grid.
   Force true text rows to an explicit LTR editing context without changing numeric inputs. */
(function(){
  function enforceTextDirection(root){
    (root||document).querySelectorAll('#viewport tr.input[data-bk-fmt="text"] td.v').forEach(function(el){
      el.setAttribute('dir','ltr');
      el.style.direction='ltr';

    });
  }
  document.addEventListener('focusin',function(e){
    var el=e.target;
    if(el && el.matches && el.matches('#viewport tr.input[data-bk-fmt="text"] td.v')){
      el.setAttribute('dir','ltr');
      el.style.direction='ltr';

    }
  });
  var priorShow=window.showSheet;
  if(typeof priorShow==='function'){
    window.showSheet=function(sheet){
      var r=priorShow.apply(this,arguments);
      setTimeout(function(){enforceTextDirection(document);},0);
      return r;
    };
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',function(){enforceTextDirection(document);});
  else enforceTextDirection(document);
})();
