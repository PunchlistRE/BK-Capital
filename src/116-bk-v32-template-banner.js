
/* V32.1 - make template-filled assumptions impossible to miss on Deal Underwrite. */
(function(){
  if(typeof RENDERERS === 'undefined' || !RENDERERS['Deal Underwrite']) return;
  var prev = RENDERERS['Deal Underwrite'];
  RENDERERS['Deal Underwrite'] = function(){
    var o = prev(); var s = bkLoad(), t = s._template; if(!t || !t.values) return o;
    var keys = Object.keys(t.values), still = keys.filter(function(k){ return s[k] === t.values[k]; }).length;
    var b = '<div class="note-flag"><span>&#9432;</span><div><b>Assumption template: ' + bkEsc(t.name) + '.</b> ' + still + ' of ' + keys.length
      + ' deal-structure assumptions (financing terms, fee rates, waterfall terms, scenario deltas) were pre-filled from this template - they are not from this property. '
      + 'Each is marked <b>TEMPLATE</b> until you change it. Market assumptions (exit cap, hold period, vacancy, growth, management fee) start blank and must be entered. '
      + '<button type="button" class="status-chip" style="margin-left:8px" onclick="bkClearTemplateValues()">Clear template values</button></div></div>';
    o.main = b + (o.main || ''); return o;
  };
})();
