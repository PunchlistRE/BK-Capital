/* ============================================================================================
   INVESTMENT TARGET (Debt > Compare, beside the Financing Lab): the reverse investment lab.
   Starting capital, a target value and a period give the compound annual return needed to get there:
       required return = (target / starting capital) ^ (1 / years) - 1
   One starting amount, one ending amount, no interim contributions or distributions, no taxes or fees. It is a planning tool,
   not an underwriting model: a deal with periodic cash flows is measured by IRR (Returns), and the Pricing panel on the
   Present Value Report answers what to pay for a deal's cash flows. The formula is the valuation engine's bkValCagr (src/202).
   The inputs are the user's own until they are saved to a deal; saved targets are append-only on the deal record (_targets).
   ============================================================================================ */
(function(){
var KEY = 'bkcapital.target.ui.v1', SHEET = 'Investment Target';
var ui = (function(){ try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch(e){ return {}; } })();
if(!(ui.capital > 0)) ui.capital = 250000; if(!(ui.target > 0)) ui.target = 1000000; if(!(ui.years > 0)) ui.years = 10;
function saveUi(){ try { localStorage.setItem(KEY, JSON.stringify(ui)); } catch(e){} }
function esc(v){ return String(v == null ? '' : v).replace(/[&<>"]/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]; }); }
function money(n){ n = Number(n); if(!isFinite(n)) return '-'; var a = Math.round(Math.abs(n)).toLocaleString('en-US'); return Math.round(n) < 0 ? '($' + a + ')' : '$' + a; }
function pct(n, d){ n = Number(n); return isFinite(n) ? (n * 100).toFixed(d == null ? 2 : d) + '%' : '-'; }
function num(raw){ var v = parseFloat(String(raw).replace(/[$,\s]/g, '')); return isFinite(v) ? v : NaN; }
function isDev(s){ return /develop/i.test(String((s || {}).dealType || '')); }

function compute(c, t, y){
  var r = window.bkValCagr(c, t, y);
  if(!(c > 0) || !(t > 0) || !(y > 0)) return { ok:false, msg:'Enter a starting capital, a target value and a period, all greater than zero.' };
  return { ok:true, rate:r, multiple:t / c, gain:t - c, perYear:(t - c) / y, path:(function(){ var o = []; for(var k = 0; k <= Math.min(Math.floor(y), 40); k++) o.push({ year:k, value:c * Math.pow(1 + r, k) }); if(Math.floor(y) !== y) o.push({ year:y, value:t }); return o; })() };
}
function dealRef(){
  var s = bkLoad(), out = { has:false }; try {
    var mr = window.bkMonthlyReturns(), d = window.bkDebt ? window.bkDebt() : {}, hold = Number(s.holdYears) || Math.round((mr.rows || []).length / 12);
    out = { has:true, name:s.name || 'This deal', equity:isDev(s) ? Number(mr.contrib) : Number(d.equity), dist:Number(mr.dist), irr:Number(mr.irr), moic:Number(mr.moic), years:hold };
  } catch(e){}
  return out;
}

window.bkTargetUpdate = function(src){
  var g = function(id){ return document.getElementById(id); };
  if(src === 'capital' || src === 'target' || src === 'years'){ var v = num(g('bk-tg-' + src).value); if(isFinite(v)) ui[src] = v; }
  else if(src === 'capital-r' || src === 'target-r' || src === 'years-r'){ var k = src.replace('-r', ''); ui[k] = Number(g('bk-tg-' + src).value); }
  saveUi(); window.bkTargetPaint();
};
window.bkTargetPaint = function(){
  var g = function(id){ return document.getElementById(id); }; if(!g('bk-tg-rate')) return;
  var r = compute(ui.capital, ui.target, ui.years), ref = dealRef();
  ['capital', 'target', 'years'].forEach(function(k){ var n = g('bk-tg-' + k), s = g('bk-tg-' + k + '-r'); if(n && document.activeElement !== n) n.value = k === 'years' ? ui[k] : Math.round(ui[k]).toLocaleString('en-US'); if(s){ if(ui[k] > Number(s.max)) s.max = ui[k]; s.value = ui[k]; } });
  g('bk-tg-rate').textContent = r.ok ? pct(r.rate) : '-'; g('bk-tg-mult').textContent = r.ok ? r.multiple.toFixed(2) + 'x' : '-'; g('bk-tg-gain').textContent = r.ok ? money(r.perYear) : '-';
  g('bk-tg-explain').textContent = r.ok ? 'To grow ' + money(ui.capital) + ' to ' + money(ui.target) + ' over ' + ui.years + ' year' + (ui.years === 1 ? '' : 's') + ', the capital must compound at about ' + pct(r.rate) + ' a year, with no interim contributions or distributions.' : r.msg;
  g('bk-tg-path').innerHTML = r.ok ? r.path.map(function(p){ return '<tr><td>' + 'Year ' + p.year + '</td><td class="r">' + money(p.value) + '</td><td class="r">' + (p.year ? money(p.value - ui.capital) : '-') + '</td></tr>'; }).join('') : '';
  var cmp = g('bk-tg-cmp'); if(cmp) cmp.innerHTML = r.ok && ref.has && isFinite(ref.irr) ? 'This deal\'s levered IRR is <b>' + pct(ref.irr) + '</b> (' + ref.moic.toFixed(2) + 'x over ' + ref.years + ' years). ' + (r.rate <= ref.irr ? 'It clears the required ' + pct(r.rate) + ' on these figures' : 'It is below the required ' + pct(r.rate)) + ', but an IRR measures dated cash flows and this calculator compounds one amount, so the two are a guide, not an equivalence.' : '';
};
window.bkTargetUseDeal = function(what){
  var ref = dealRef(); if(!ref.has) return;
  if(what === 'equity' && ref.equity > 0) ui.capital = Math.round(ref.equity);
  if(what === 'distributions' && ref.dist > 0){ ui.target = Math.round(ref.dist); if(ref.years > 0) ui.years = ref.years; }
  saveUi(); window.bkTargetPaint();
};
window.bkTargetReset = function(){ ui = { capital:250000, target:1000000, years:10 }; saveUi(); window.bkTargetPaint(); };
window.bkTargetSave = function(){
  var r = compute(ui.capital, ui.target, ui.years); if(!r.ok) return; var nm = document.getElementById('bk-tg-name'), s = bkLoad();
  s._targets = (Array.isArray(s._targets) ? s._targets : []).concat([{ id:'tg_' + Date.now().toString(36), name:(nm && nm.value.trim()) || ('Target ' + ((s._targets || []).length + 1)), createdAt:new Date().toISOString(), engineVersion:window.bkValEngineVersion, inputs:{ capital:ui.capital, target:ui.target, years:ui.years }, results:{ rate:r.rate, multiple:r.multiple } }]);
  bkSave(s); if(typeof showSheet === 'function') showSheet(SHEET);
};
window.bkTargetLoad = function(id){ var s = bkLoad(), t = (s._targets || []).filter(function(x){ return x.id === id; })[0]; if(!t) return; ui.capital = t.inputs.capital; ui.target = t.inputs.target; ui.years = t.inputs.years; saveUi(); window.bkTargetPaint(); };

var inp = function(k, label, min, max, step){ return '<div class="ae-form" style="margin:12px 0"><div style="display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap"><label style="font-weight:600">' + label + '</label><input id="bk-tg-' + k + '" class="ae-in" style="width:150px !important;text-align:right" inputmode="decimal" onchange="bkTargetUpdate(\'' + k + '\')"></div><input id="bk-tg-' + k + '-r" type="range" min="' + min + '" max="' + max + '" step="' + step + '" style="width:100%" oninput="bkTargetUpdate(\'' + k + '-r\')"></div>'; };
RENDERERS[SHEET] = function(){
  var s = bkLoad() || {}, ref = dealRef(), saved = Array.isArray(s._targets) ? s._targets : [];
  var o = { title:'Investment Target', crumbs:'Debt', desc:'Work backward from a capital target to the annual return it requires.', meta:{ Property:s.name || '' }, sidebar:'' };
  var rows = saved.map(function(t){ return '<tr><td>' + esc(t.name) + '</td><td>' + esc(new Date(t.createdAt).toLocaleDateString('en-US')) + '</td><td class="r">' + money(t.inputs.capital) + '</td><td class="r">' + money(t.inputs.target) + '</td><td class="r">' + t.inputs.years + '</td><td class="r">' + pct(t.results.rate) + '</td><td><button type="button" class="ae-btn" onclick="bkTargetLoad(\'' + t.id + '\')">Load</button></td></tr>'; }).join('');
  o.main = '<div class="ae"><div class="ae-panel"><div class="ae-ph"><i>T</i>Reverse investment lab</div><div style="padding:6px 14px 14px">'
    + inp('capital', 'Starting capital', 10000, 2000000, 5000) + inp('target', 'Target value', 50000, 10000000, 25000) + inp('years', 'Investment period (years)', 1, 30, 1)
    + '<div class="ae-row" style="flex-wrap:wrap;gap:8px">' + (ref.has && ref.equity > 0 ? '<button type="button" class="ae-btn" onclick="bkTargetUseDeal(\'equity\')">Use this deal\'s closing equity (' + money(ref.equity) + ')</button>' : '') + (ref.has && ref.dist > 0 ? '<button type="button" class="ae-btn" onclick="bkTargetUseDeal(\'distributions\')">Use this deal\'s total distributions and hold (' + money(ref.dist) + ', ' + ref.years + ' years)</button>' : '') + '<button type="button" class="ae-btn" onclick="bkTargetReset()">Reset</button></div></div></div>'
    + '<div class="ae-panel"><div class="ae-ph"><i>R</i>What it takes</div><table class="rp-tbl" id="rp-target"><tbody><tr><td>Required annual return</td><td class="r"><b id="bk-tg-rate">-</b></td><td class="dim">(target / starting capital) ^ (1 / years) - 1</td></tr><tr><td>Growth multiple</td><td class="r" id="bk-tg-mult">-</td><td class="dim">target / starting capital</td></tr><tr><td>Average gain per year</td><td class="r" id="bk-tg-gain">-</td><td class="dim">(target - capital) / years, simple, not compounded</td></tr></tbody></table><div class="ae-hint" id="bk-tg-explain"></div><div class="ae-hint" id="bk-tg-cmp"></div></div>'
    + '<div class="ae-panel"><div class="ae-ph"><i>P</i>Growth path at the required return</div><table class="rp-tbl" id="rp-target-path"><thead><tr><th>Period</th><th class="r">Value</th><th class="r">Gain to date</th></tr></thead><tbody id="bk-tg-path"></tbody></table></div>'
    + '<div class="ae-panel"><div class="ae-ph"><i>S</i>Save to this deal</div><div class="ae-row" style="flex-wrap:wrap;gap:10px;padding:8px 14px"><input id="bk-tg-name" class="ae-in" style="width:260px !important;max-width:100% !important" placeholder="Name this target"><button type="button" class="ae-btn pri" onclick="bkTargetSave()">Save target to this deal</button></div>' + (saved.length ? '<table class="rp-tbl" id="rp-target-saved"><thead><tr><th>Target</th><th>Saved</th><th class="r">Capital</th><th class="r">Target value</th><th class="r">Years</th><th class="r">Required return</th><th></th></tr></thead><tbody>' + rows + '</tbody></table>' : '<div class="ae-hint">Nothing saved on this deal yet. Your inputs above are yours until you save them to a deal; saved targets are never overwritten.</div>') + '</div>'
    + '<div class="ae-hint">This is a compound-growth target calculator, not an underwriting model. It assumes one starting amount growing to one target value with no interim contributions, distributions, taxes, fees or volatility. For a deal with periodic cash flows use the IRR (Returns), and for what to pay for a deal\'s cash flows use the Pricing panel on the Present Value Report.</div></div>';
  setTimeout(function(){ window.bkTargetPaint(); }, 0);
  return o;
};
})();
