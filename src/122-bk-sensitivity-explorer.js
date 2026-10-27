
/* ===========================================================================
   SENSITIVITY EXPLORER - tornado, spider and heat-map views with toggles
   ===========================================================================
   Every figure is a live re-run of the canonical engine (bkMonthlyReturns and,
   for partner metrics, bkWaterfallV07) on a scratch copy of the active deal -
   the same isolation bkRunScenario() uses, so the saved deal is never written.

   The toggles (output metric, step size, heat-map axes, drivers shown, break-
   even target) are VIEW preferences, not deal assumptions: they live in this
   browser's localStorage and are never synced or stamped on the deal.
   =========================================================================== */
(function(){
'use strict';
if(typeof RENDERERS === 'undefined' || typeof RENDERERS['Sensitivity'] !== 'function') return;

var PREF_KEY = 'bkcapital.sensitivity.view.v01';
var DEF = { metric:'levIRR', step:'std', gx:'exitCap', gy:'rentGrowth', hide:[], beTarget:'pref' };
function prefs(){ var p = {}; try { p = JSON.parse(localStorage.getItem(PREF_KEY) || '{}') || {}; } catch(e){} return Object.assign({}, DEF, p); }
function savePrefs(p){ try { localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch(e){} }

function N(v){ var n = Number(v); return isFinite(n) ? n : 0; }
function esc(v){ return (typeof bkEsc === 'function') ? bkEsc(v) : String(v == null ? '' : v); }
function pct(v, dp){ return isFinite(v) ? (v*100).toFixed(dp == null ? 2 : dp) + '%' : 'n/a'; }
function money(v){ if(!isFinite(v)) return 'n/a'; var a = Math.abs(v), s = a >= 1e6 ? '$'+(a/1e6).toFixed(2)+'M' : '$'+Math.round(a).toLocaleString('en-US'); return v < 0 ? '('+s+')' : s; }

var METRICS = {
  levIRR  : { label:'Levered IRR',          fmt:function(v){ return pct(v); },              rate:true },
  levMOIC : { label:'Levered Equity Multiple', fmt:function(v){ return isFinite(v) ? v.toFixed(2)+'x' : 'n/a'; } },
  unlevIRR: { label:'Unlevered IRR',        fmt:function(v){ return pct(v); },              rate:true },
  unlevMOIC:{ label:'Unlevered Multiple',   fmt:function(v){ return isFinite(v) ? v.toFixed(2)+'x' : 'n/a'; } },
  lpIRR   : { label:'LP IRR (after promote)', fmt:function(v){ return pct(v); },            rate:true, partner:true },
  gpIRR   : { label:'GP IRR (co-invest + promote)', fmt:function(v){ return pct(v); },      rate:true, partner:true }
};
var STEPS = { narrow:{ label:'Narrow', k:0.5 }, std:{ label:'Standard', k:1 }, wide:{ label:'Wide', k:2 } };

/* Each driver: a base step, how a signed delta becomes engine overrides, and how to print the shifted value. */
function drivers(s){
  var floating = String(s.debtRateType || 'Fixed') === 'Floating';
  var rateKey = floating ? 'debtIndexRate' : 'acqRate';
  var hasRR = Array.isArray(s.rentRoll) && s.rentRoll.length > 0;
  var EXP = ['taxes','insurance','payroll','rm','turnover','utilities','contract','marketing','ga','miscPerGSF'];
  function scaleRR(f){ return s.rentRoll.map(function(u){ return Object.assign({}, u, { inPlaceRent:N(u.inPlaceRent)*f, marketRent:N(u.marketRent)*f }); }); }
  return [
    { id:'exitCap',    label:'Exit Cap Rate',     step:0.005, kind:'pp',
      ov:function(d){ return { exitCap: Math.max(0.0025, N(s.exitCap)+d) }; },        show:function(d){ return pct(Math.max(0.0025, N(s.exitCap)+d)); } },
    { id:'rentGrowth', label:'Rent Growth',       step:0.01,  kind:'pp',
      ov:function(d){ return { rentGrowth:N(s.rentGrowth)+d, commercialRentGrowth:N(s.commercialRentGrowth)+d }; },
      show:function(d){ return pct(N(s.rentGrowth)+d); } },
    { id:'rentLevel',  label:'Rent Level',        step:0.05,  kind:'rel',
      ov:function(d){ var o = { avgRent:N(s.avgRent)*(1+d), commercialRent:N(s.commercialRent)*(1+d) }; if(hasRR) o.rentRoll = scaleRR(1+d); return o; },
      show:function(d){ return (d >= 0 ? '+' : '\u2212') + Math.abs(d*100).toFixed(1) + '%'; } },
    { id:'vacancy',    label:'Vacancy',           step:0.01,  kind:'pp',
      ov:function(d){ return { vacancy:Math.min(0.95, Math.max(0, N(s.vacancy)+d)), commercialVacancy:Math.min(0.95, Math.max(0, N(s.commercialVacancy)+d)) }; },
      show:function(d){ return pct(Math.min(0.95, Math.max(0, N(s.vacancy)+d))); } },
    { id:'opexLevel',  label:'Operating Expenses', step:0.05, kind:'rel',
      ov:function(d){ var o = {}; EXP.forEach(function(k){ o[k] = N(s[k])*(1+d); }); return o; },
      show:function(d){ return (d >= 0 ? '+' : '\u2212') + Math.abs(d*100).toFixed(1) + '%'; } },
    { id:'opexGrowth', label:'Opex Growth',       step:0.01,  kind:'pp',
      ov:function(d){ return { opexGrowth:N(s.opexGrowth)+d }; },                       show:function(d){ return pct(N(s.opexGrowth)+d); } },
    { id:'price',      label:'Purchase Price',    step:0.05,  kind:'rel',
      ov:function(d){ return { purchasePrice:N(s.purchasePrice)*(1+d) }; },             show:function(d){ return money(N(s.purchasePrice)*(1+d)); } },
    { id:'rate',       label:floating ? 'Debt Index Rate' : 'Debt Coupon', step:0.005, kind:'pp',
      ov:function(d){ var o = {}; o[rateKey] = Math.max(0, N(s[rateKey])+d); return o; }, show:function(d){ return pct(Math.max(0, N(s[rateKey])+d)); } },
    { id:'hold',       label:'Hold Period',       step:1,     kind:'yrs', integer:true,
      ov:function(d){ return { holdYears: Math.max(1, Math.min(15, Math.round(N(s.holdYears)+d))) }; },
      show:function(d){ return Math.max(1, Math.min(15, Math.round(N(s.holdYears)+d))) + ' yrs'; } }
  ];
}
function stepOf(dv, p){ var k = STEPS[p.step] ? STEPS[p.step].k : 1; return dv.integer ? Math.max(1, Math.round(dv.step*k)) : dv.step*k; }
function stepLabel(dv, p){ var st = stepOf(dv, p);
  return dv.kind === 'pp' ? (st*100).toFixed(2).replace(/\.?0+$/,'') + ' pts' : dv.kind === 'rel' ? (st*100).toFixed(1).replace(/\.0$/,'') + '%' : st + ' yr' + (st === 1 ? '' : 's'); }

/* One isolated engine run, memoised for the duration of a render. */
window.bkSensDrivers = drivers;   /* shared with the Probability-Weighted Returns sheet */
function makeRunner(metric){
  var cache = {};
  return function(ov){
    var key = JSON.stringify(ov);
    if(Object.prototype.hasOwnProperty.call(cache, key)) return cache[key];
    var real = bkLoad(), scen = Object.assign({}, real, ov);
    var oL = window.bkLoad, oS = window.bkSave, v = NaN;
    window.bkLoad = function(){ return scen; };
    window.bkSave = function(d){ Object.assign(scen, d); };
    try {
      var x = bkMonthlyReturns();
      if(metric === 'levIRR') v = x.irr;
      else if(metric === 'levMOIC') v = x.moic;
      else if(metric === 'unlevIRR' || metric === 'unlevMOIC'){ var u = x.u || bkAnnualCF(); v = metric === 'unlevIRR' ? u.irr : u.moic; }
      else { var w = bkWaterfallV07(); v = metric === 'lpIRR' ? w.lpIRR : w.gpIRR; }
    } catch(e){ v = NaN; }
    finally { window.bkLoad = oL; window.bkSave = oS; }
    v = Number(v); if(!isFinite(v)) v = NaN;
    cache[key] = v; return v;
  };
}

/* ---------------------------------------------------------------- charts */
function niceTicks(lo, hi, n){
  if(!(hi > lo)){ var pad = Math.abs(lo || 1)*0.1; lo -= pad; hi += pad; }
  var span = hi - lo, raw = span / (n || 4), mag = Math.pow(10, Math.floor(Math.log10(raw))), f = raw/mag;
  var step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * mag;
  var a = Math.floor(lo/step)*step, b = Math.ceil(hi/step)*step, t = [];
  for(var v = a; v <= b + step*1e-9; v += step) t.push(+v.toFixed(12));
  return t;
}
function tip(html){ return ' data-tip="' + esc(html) + '"'; }

function tornado(rows, base, M){
  // rows: [{label, lo, hi, loShow, hiShow}] sorted by swing
  var W = 760, L = 150, R = 70, rowH = 30, top = 26, H = top + rows.length*rowH + 30;
  var vals = [base]; rows.forEach(function(r){ if(isFinite(r.lo)) vals.push(r.lo); if(isFinite(r.hi)) vals.push(r.hi); });
  var ticks = niceTicks(Math.min.apply(null, vals), Math.max.apply(null, vals), 5);
  var x0 = ticks[0], x1 = ticks[ticks.length-1];
  var X = function(v){ return L + 50 + (v - x0)/(x1 - x0) * (W - L - 50 - R); };   /* 50px of room left of the axis for the low-end value labels */
  var g = '<svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Tornado chart of '+esc(M.label)+' by driver">';
  ticks.forEach(function(t){ g += '<line class="grid" x1="'+X(t)+'" x2="'+X(t)+'" y1="'+(top-6)+'" y2="'+(H-24)+'"/>'
    + '<text x="'+X(t)+'" y="'+(H-8)+'" text-anchor="middle">'+esc(M.fmt(t))+'</text>'; });
  rows.forEach(function(r, i){
    var y = top + i*rowH, bh = 18, by = y + (rowH-bh)/2, cy = y + rowH/2 + 4;
    g += '<g class="row"><text class="lbl" x="'+(L-10)+'" y="'+cy+'" text-anchor="end">'+esc(r.label)+'</text>';
    [['lo', r.lo, r.loShow, '&minus;'], ['hi', r.hi, r.hiShow, '+']].forEach(function(e){
      var v = e[1]; if(!isFinite(v)) return;
      var a = Math.min(X(base), X(v)), w = Math.max(1, Math.abs(X(v) - X(base)));
      var up = v >= base, col = up ? 'var(--sx-up)' : 'var(--sx-dn)';
      var t = '<b>'+esc(r.label)+' '+e[3]+' one step</b><br>'+esc(e[2])+' &rarr; '+esc(M.fmt(v))+' ('+(v>=base?'+':'')+esc(M.rate ? ((v-base)*10000).toFixed(0)+' bps' : (v-base).toFixed(2)+'x')+')';
      // rounded data-end, square at the base line
      var r4 = Math.min(4, w/2), xEnd = up ? a + w : a;
      g += '<path class="bar" fill="'+col+'" d="'+(up
            ? 'M'+a+','+by+' h'+(w-r4)+' a'+r4+','+r4+' 0 0 1 '+r4+','+r4+' v'+(bh-2*r4)+' a'+r4+','+r4+' 0 0 1 -'+r4+','+r4+' h-'+(w-r4)+' z'
            : 'M'+(a+w)+','+by+' h-'+(w-r4)+' a'+r4+','+r4+' 0 0 0 -'+r4+','+r4+' v'+(bh-2*r4)+' a'+r4+','+r4+' 0 0 0 '+r4+','+r4+' h'+(w-r4)+' z')+'"/>'
        + '<rect class="hit" x="'+a+'" y="'+y+'" width="'+w+'" height="'+rowH+'"'+tip(t)+'/>'
        + '<text class="v" x="'+(up ? xEnd+5 : xEnd-5)+'" y="'+cy+'" text-anchor="'+(up?'start':'end')+'">'+esc(M.fmt(v))+'</text>';
    });
    g += '</g>';
  });
  g += '<line class="axis" x1="'+X(base)+'" x2="'+X(base)+'" y1="'+(top-10)+'" y2="'+(H-24)+'" stroke-dasharray="3 3"/>'
     + '<text x="'+X(base)+'" y="'+(top-12)+'" text-anchor="middle" class="v">Base '+esc(M.fmt(base))+'</text></svg>';
  return g;
}

function spider(series, M, nSteps){
  // series: [{label, color, pts:[{k, v, show}]}], k in -nSteps..nSteps
  var W = 760, L = 58, R = 156, top = 14, H = 300, bottom = 34;
  var vals = []; series.forEach(function(s){ s.pts.forEach(function(p){ if(isFinite(p.v)) vals.push(p.v); }); });
  if(!vals.length) return '<p class="bk-sx-sub">No finite results to chart.</p>';
  var ticks = niceTicks(Math.min.apply(null, vals), Math.max.apply(null, vals), 5);
  var y0 = ticks[0], y1 = ticks[ticks.length-1];
  var X = function(k){ return L + (k + nSteps)/(2*nSteps) * (W - L - R); };
  var Y = function(v){ return top + (1 - (v - y0)/(y1 - y0)) * (H - top - bottom); };
  var g = '<svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Spider chart of '+esc(M.label)+' against steps from base">';
  ticks.forEach(function(t){ g += '<line class="grid" x1="'+L+'" x2="'+(W-R)+'" y1="'+Y(t)+'" y2="'+Y(t)+'"/>'
    + '<text x="'+(L-8)+'" y="'+(Y(t)+4)+'" text-anchor="end">'+esc(M.fmt(t))+'</text>'; });
  for(var k = -nSteps; k <= nSteps; k++){
    g += '<text x="'+X(k)+'" y="'+(H-bottom+18)+'" text-anchor="middle">'+(k === 0 ? 'Base' : (k > 0 ? '+' : '&minus;')+Math.abs(k)+' step'+(Math.abs(k)>1?'s':''))+'</text>';
  }
  g += '<line class="axis" x1="'+X(0)+'" x2="'+X(0)+'" y1="'+top+'" y2="'+(H-bottom)+'" stroke-dasharray="3 3"/>';
  // end labels: spread vertically so they never collide
  var ends = [];
  series.forEach(function(s){
    var d = '', pts = s.pts.filter(function(p){ return isFinite(p.v); });
    pts.forEach(function(p, i){ d += (i ? 'L' : 'M') + X(p.k).toFixed(1) + ',' + Y(p.v).toFixed(1); });
    g += '<path d="'+d+'" fill="none" stroke="'+s.color+'" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>';
    pts.forEach(function(p){
      g += '<circle cx="'+X(p.k)+'" cy="'+Y(p.v)+'" r="4" fill="'+s.color+'" stroke="var(--sx-surface)" stroke-width="2"/>'
         + '<circle cx="'+X(p.k)+'" cy="'+Y(p.v)+'" r="11" fill="transparent"'+tip('<b>'+esc(s.label)+'</b><br>'+esc(p.show)+' &rarr; '+esc(M.fmt(p.v)))+'/>';
    });
    var last = pts[pts.length-1]; if(last) ends.push({ y:Y(last.v), label:s.label, color:s.color });
  });
  ends.sort(function(a,b){ return a.y - b.y; });
  /* 17 px apart (the labels are 11 px): push down from the top, then back up from the bottom, so a crowded group spreads about its centre and stays inside the plot */
  var GAP = 17, yMax = H - bottom;
  for(var i = 1; i < ends.length; i++){ if(ends[i].y - ends[i-1].y < GAP) ends[i].y = ends[i-1].y + GAP; }
  var over = ends.length ? ends[ends.length-1].y - yMax : 0;
  if(over > 0) ends.forEach(function(e){ e.y -= over; });
  for(var j = ends.length - 2; j >= 0; j--){ if(ends[j+1].y - ends[j].y < GAP) ends[j].y = ends[j+1].y - GAP; }
  ends.forEach(function(e){ e.y = Math.max(e.y, top + 4); });
  ends.forEach(function(e){ g += '<text x="'+(W-R+8)+'" y="'+(e.y+4)+'" class="lbl" style="font-size:11px"><tspan fill="'+e.color+'">&#9632;</tspan> '+esc(e.label)+'</text>'; });
  return g + '</svg>';
}

function mix(a, b, t){ // hex mix for heat cells; CSS vars can't be interpolated in JS, so the heat map uses the light-mode poles and a dark-safe text rule
  function h(x){ return [parseInt(x.slice(1,3),16), parseInt(x.slice(3,5),16), parseInt(x.slice(5,7),16)]; }
  var A = h(a), B = h(b), c = A.map(function(v,i){ return Math.round(v + (B[i]-v)*t); });
  return { css:'rgb('+c.join(',')+')', lum:(0.2126*c[0] + 0.7152*c[1] + 0.0722*c[2])/255 };
}

/* ---------------------------------------------------------------- view */
function explorer(s){
  var p = prefs();
  if(!METRICS[p.metric]) p.metric = 'levIRR';
  var M = METRICS[p.metric], run = makeRunner(p.metric);
  var D = drivers(s), byId = {}; D.forEach(function(d){ byId[d.id] = d; });
  if(!byId[p.gx]) p.gx = 'exitCap'; if(!byId[p.gy] || p.gy === p.gx) p.gy = p.gx === 'rentGrowth' ? 'exitCap' : 'rentGrowth';
  var base = run({});
  if(!isFinite(base)) return '<div class="bk-sx"><div class="bk-sx-card"><p class="bk-sx-title">Sensitivity Explorer</p><p class="bk-sx-sub">The engine does not produce a finite '+esc(M.label)+' for this deal yet, so there is nothing to flex.</p></div></div>';

  var sel = function(id, cur, opts){ return '<select data-sx="'+id+'">' + opts.map(function(o){ return '<option value="'+o[0]+'"'+(o[0]===cur?' selected':'')+'>'+esc(o[1])+'</option>'; }).join('') + '</select>'; };
  var dOpts = D.map(function(d){ return [d.id, d.label]; });
  var controls = '<div class="bk-sx-card"><p class="bk-sx-title">Sensitivity Explorer</p>'
    + '<p class="bk-sx-sub">Every point is a live re-run of the underwriting engine on a scratch copy of this deal. These are view settings for this browser - they never change the deal.</p>'
    + '<div class="bk-sx-controls">'
    + '<label class="bk-sx-ctl"><span>Output metric</span>' + sel('metric', p.metric, Object.keys(METRICS).map(function(k){ return [k, METRICS[k].label]; })) + '</label>'
    + '<div class="bk-sx-ctl"><span>Step size</span><div class="bk-sx-seg">' + Object.keys(STEPS).map(function(k){
        return '<button type="button" data-sx-step="'+k+'" aria-pressed="'+(p.step===k)+'">'+STEPS[k].label+'</button>'; }).join('') + '</div></div>'
    + '<label class="bk-sx-ctl"><span>Heat map rows</span>' + sel('gy', p.gy, dOpts) + '</label>'
    + '<label class="bk-sx-ctl"><span>Heat map columns</span>' + sel('gx', p.gx, dOpts) + '</label>'
    + '<button type="button" class="status-chip" data-sx-reset="1">RESET VIEW</button>'
    + '</div>'
    + '<details><summary>Step sizes at this setting</summary><table><thead><tr><th>Driver</th><th>One step</th><th>Base value</th></tr></thead><tbody>'
    + D.map(function(d){ return '<tr><td>'+esc(d.label)+'</td><td>'+esc(stepLabel(d, p))+'</td><td>'+esc(d.show(0))+'</td></tr>'; }).join('')
    + '</tbody></table></details></div>';

  // ---- tornado: one step each way, sorted by swing
  var tRows = D.map(function(d){ var st = stepOf(d, p);
    return { label:d.label, lo:run(d.ov(-st)), hi:run(d.ov(st)), loShow:d.show(-st), hiShow:d.show(st) }; });
  tRows.forEach(function(r){ r.swing = Math.abs((isFinite(r.hi)?r.hi:base) - (isFinite(r.lo)?r.lo:base)); });
  tRows.sort(function(a,b){ return b.swing - a.swing; });
  var tornadoCard = '<div class="bk-sx-card"><p class="bk-sx-title">Tornado - which assumption moves '+esc(M.label)+' most</p>'
    + '<p class="bk-sx-sub">Each driver moved one step down and one step up from base, everything else held. Longest bar first.</p>'
    + '<div class="bk-sx-svgwrap">' + tornado(tRows, base, M) + '</div>'
    + '<div class="bk-sx-legend"><span style="--c:var(--sx-up)"><i></i>Above base</span><span style="--c:var(--sx-dn)"><i></i>Below base</span></div>'
    + '<details><summary>Table view</summary><table><thead><tr><th>Driver</th><th>Down one step</th><th>'+esc(M.label)+'</th><th>Up one step</th><th>'+esc(M.label)+'</th><th>Swing</th></tr></thead><tbody>'
    + tRows.map(function(r){ return '<tr><td>'+esc(r.label)+'</td><td>'+esc(r.loShow)+'</td><td>'+esc(M.fmt(r.lo))+'</td><td>'+esc(r.hiShow)+'</td><td>'+esc(M.fmt(r.hi))+'</td><td>'+esc(M.rate ? (r.swing*10000).toFixed(0)+' bps' : r.swing.toFixed(2)+'x')+'</td></tr>'; }).join('')
    + '</tbody></table></details></div>';

  // ---- spider: +/-2 steps per visible driver; colour follows the driver, never its rank
  var hide = Array.isArray(p.hide) ? p.hide : [];
  var COLORS = D.map(function(_, i){ return 'var(--s'+(i+1)+')'; });
  var series = [];
  D.forEach(function(d, i){
    if(hide.indexOf(d.id) > -1) return;
    var st = stepOf(d, p), pts = [];
    for(var k = -2; k <= 2; k++) pts.push({ k:k, v:k === 0 ? base : run(d.ov(k*st)), show:d.show(k*st) });
    series.push({ label:d.label, color:COLORS[i], pts:pts });
  });
  var chips = D.map(function(d, i){ var on = hide.indexOf(d.id) < 0;
    return '<button type="button" class="bk-sx-chip" data-sx-driver="'+d.id+'" aria-pressed="'+on+'" style="--c:'+COLORS[i]+'"><i></i>'+esc(d.label)+'</button>'; }).join('');
  var spiderCard = '<div class="bk-sx-card"><p class="bk-sx-title">Spider - '+esc(M.label)+' as each driver moves &plusmn;2 steps</p>'
    + '<p class="bk-sx-sub">Steeper line = more sensitive. Click a driver to show or hide it.</p>'
    + '<div class="bk-sx-chips">'+chips+'</div>'
    + (series.length ? '<div class="bk-sx-svgwrap">' + spider(series, M, 2) + '</div>' : '<p class="bk-sx-sub">All drivers are hidden - select one above.</p>')
    + '<details><summary>Table view</summary><table><thead><tr><th>Driver</th><th>&minus;2</th><th>&minus;1</th><th>Base</th><th>+1</th><th>+2</th></tr></thead><tbody>'
    + series.map(function(s){ return '<tr><td>'+esc(s.label)+'</td>'+s.pts.map(function(q){ return '<td>'+esc(M.fmt(q.v))+'</td>'; }).join('')+'</tr>'; }).join('')
    + '</tbody></table></details></div>';

  // ---- heat map: any two drivers, diverging around base
  var gx = byId[p.gx], gy = byId[p.gy], sx = stepOf(gx, p), sy = stepOf(gy, p), ks = [-2,-1,0,1,2];
  var cells = ks.map(function(ky){ return ks.map(function(kx){ return (kx === 0 && ky === 0) ? base : run(Object.assign({}, gy.ov(ky*sy), gx.ov(kx*sx))); }); });
  var maxDev = 0; cells.forEach(function(r){ r.forEach(function(v){ if(isFinite(v)) maxDev = Math.max(maxDev, Math.abs(v-base)); }); });
  var heat = '<table class="bk-sx-heat"><thead><tr><th class="corner">'+esc(gx.label)+' &rarr;<br>'+esc(gy.label)+' &darr;</th>'
    + ks.map(function(kx){ return '<th>'+esc(gx.show(kx*sx))+'</th>'; }).join('') + '</tr></thead><tbody>'
    + ks.map(function(ky, i){ return '<tr><th class="rh">'+esc(gy.show(ky*sy))+'</th>' + ks.map(function(kx, j){
        var v = cells[i][j], t = maxDev > 0 && isFinite(v) ? Math.min(1, Math.abs(v-base)/maxDev) : 0;
        var c = !isFinite(v) ? null : mix('#eef2f6', v >= base ? '#2a78d6' : '#e34948', t*0.85);
        var isBase = kx === 0 && ky === 0;
        return '<td class="'+(isBase?'base ':'')+(c && c.lum < 0.55 ? 'dark' : '')+'"'+(c?' style="background:'+c.css+'"':'')
          + tip('<b>'+esc(gy.label)+' '+esc(gy.show(ky*sy))+' &middot; '+esc(gx.label)+' '+esc(gx.show(kx*sx))+'</b><br>'+esc(M.label)+' '+esc(M.fmt(v))
              + (isFinite(v) && !isBase ? ' ('+(v>=base?'+':'')+esc(M.rate ? ((v-base)*10000).toFixed(0)+' bps' : (v-base).toFixed(2)+'x')+' vs base)' : ''))
          + '>'+esc(M.fmt(v))+'</td>'; }).join('') + '</tr>'; }).join('')
    + '</tbody></table>';
  var heatCard = '<div class="bk-sx-card"><p class="bk-sx-title">Heat map - '+esc(gy.label)+' &times; '+esc(gx.label)+' &rarr; '+esc(M.label)+'</p>'
    + '<p class="bk-sx-sub">Pick any two drivers above. The outlined cell is base; blue is better than base, red is worse.</p>'
    + heat + '<div class="bk-sx-scale">Worse <b></b> Better</div></div>';

  // ---- break-evens: how far each driver can move before levered IRR falls to the chosen target
  var target = p.beTarget === 'zero' ? 0 : p.beTarget === 'hurdle2' ? N(s.hurdle2) : N(s.pref);
  var irrRun = p.metric === 'levIRR' ? run : makeRunner('levIRR');
  var baseIrr = irrRun({});
  var beRows = ['exitCap','rentGrowth','rentLevel','vacancy','opexLevel','price','rate'].map(function(id){
    var d = byId[id]; var st = d.step;
    // direction that hurts IRR
    var dir = irrRun(d.ov(st)) < baseIrr ? 1 : -1;
    var f = function(x){ return irrRun(d.ov(dir*x)) - target; };
    if(!isFinite(baseIrr)) return { d:d, txt:'n/a' };
    if(baseIrr < target) return { d:d, txt:'Already below target', neg:true };
    var lo = 0, hi = st, n = 0;
    while(f(hi) > 0 && n < 12){ lo = hi; hi *= 2; n++; }
    if(f(hi) > 0) return { d:d, txt:'Not reached', far:true };
    for(var it = 0; it < 28; it++){ var mid = (lo+hi)/2; if(f(mid) > 0) lo = mid; else hi = mid; }
    var x = dir*hi;
    return { d:d, at:d.show(x), move:(d.kind === 'pp' ? (x>=0?'+':'&minus;')+(Math.abs(x)*100).toFixed(2)+' pts' : (x>=0?'+':'&minus;')+(Math.abs(x)*100).toFixed(1)+'%') };
  });
  var beSel = '<select data-sx="beTarget">' + [['pref','Tier 1 preferred return ('+pct(N(s.pref))+')'],['hurdle2','Tier 2 hurdle ('+pct(N(s.hurdle2))+')'],['zero','0% (return of capital)']]
    .map(function(o){ return '<option value="'+o[0]+'"'+(p.beTarget===o[0]?' selected':'')+'>'+esc(o[1])+'</option>'; }).join('') + '</select>';
  var beCard = '<div class="bk-sx-card"><p class="bk-sx-title">Break-even cushion - Levered IRR</p>'
    + '<p class="bk-sx-sub">How far each assumption can move against the deal, alone, before levered IRR ('+esc(pct(baseIrr))+' today) falls to the target.</p>'
    + '<div class="bk-sx-controls" style="margin-bottom:10px"><label class="bk-sx-ctl"><span>Target</span>'+beSel+'</label></div>'
    + '<table class="bk-sx-be"><thead><tr><th>Driver</th><th>Base</th><th>Break-even value</th><th>Cushion</th></tr></thead><tbody>'
    + beRows.map(function(r){ return '<tr><td>'+esc(r.d.label)+'</td><td>'+esc(r.d.show(0))+'</td>'
        + (r.at ? '<td>'+esc(r.at)+'</td><td>'+r.move+'</td>' : '<td colspan="2" class="'+(r.neg?'cushion-neg':'')+'">'+esc(r.txt)+'</td>') + '</tr>'; }).join('')
    + '</tbody></table></div>';

  return '<div class="bk-sx">' + controls + tornadoCard + spiderCard + heatCard + beCard + '</div>';
}

/* ---------------------------------------------------------------- wiring */
var prev = RENDERERS['Sensitivity'];
var wrapped = function(){
  var o = prev.apply(this, arguments);
  try {
    if(typeof window.bkProductionCounts === 'function' && !window.bkProductionCounts().activeDeal) return o;
    if(/no deal loaded|there is no active deal/i.test(String(o && o.main || ''))) return o;
    o.main = explorer(bkLoad())
      + '<div class="bk-sx-card" style="background:transparent;border:0;box-shadow:none;padding:0 0 0;margin-top:22px"><p class="bk-sx-title">Detailed grids</p></div>'
      + (o.main || '');
  } catch(e){
    o.main = '<div class="note-flag"><span>&#9888;</span><div>The sensitivity explorer could not render: '+esc(e.message)+'. The grids below are unaffected.</div></div>' + (o.main || '');
  }
  return o;
};
Object.keys(prev).forEach(function(k){ if(k.indexOf('__') === 0) wrapped[k] = prev[k]; });
if(typeof window.bkRegisterRenderer === 'function') window.bkRegisterRenderer('Sensitivity', wrapped); else RENDERERS['Sensitivity'] = wrapped;

function rerender(){ if(typeof currentSheet !== 'undefined' && currentSheet === 'Sensitivity') showSheet('Sensitivity'); }
document.addEventListener('change', function(e){
  var t = e.target; if(!t || !t.matches || !t.matches('.bk-sx select[data-sx]')) return;
  var p = prefs(); p[t.getAttribute('data-sx')] = t.value;
  if(p.gx === p.gy){ var other = t.getAttribute('data-sx') === 'gx' ? 'gy' : 'gx'; p[other] = p.gx === 'exitCap' ? 'rentGrowth' : 'exitCap'; }
  savePrefs(p); rerender();
});
document.addEventListener('click', function(e){
  var b = e.target && e.target.closest && e.target.closest('.bk-sx [data-sx-step], .bk-sx [data-sx-driver], .bk-sx [data-sx-reset]');
  if(!b) return;
  var p = prefs();
  if(b.hasAttribute('data-sx-step')) p.step = b.getAttribute('data-sx-step');
  else if(b.hasAttribute('data-sx-reset')) p = Object.assign({}, DEF);
  else { var id = b.getAttribute('data-sx-driver'), h = Array.isArray(p.hide) ? p.hide.slice() : [], i = h.indexOf(id);
         if(i > -1) h.splice(i, 1); else h.push(id); p.hide = h; }
  savePrefs(p); rerender();
});
/* one shared tooltip for every chart mark (hit targets are larger than the marks) */
var tipEl = null;
function tipNode(){ if(!tipEl){ tipEl = document.createElement('div'); tipEl.className = 'bk-sx-tip'; document.body.appendChild(tipEl); } return tipEl; }
document.addEventListener('mousemove', function(e){
  var t = e.target && e.target.closest && e.target.closest('.bk-sx [data-tip]');
  var n = tipNode();
  if(!t){ n.style.display = 'none'; return; }
  n.innerHTML = t.getAttribute('data-tip');
  n.style.display = 'block';
  var x = e.clientX + 14, y = e.clientY + 14, r = n.getBoundingClientRect();
  if(x + r.width > window.innerWidth - 8) x = e.clientX - r.width - 14;
  if(y + r.height > window.innerHeight - 8) y = e.clientY - r.height - 14;
  n.style.left = x + 'px'; n.style.top = y + 'px';
});
})();
