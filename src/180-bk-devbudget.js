/* ===========================================================================
   DEVELOPMENT BUDGET CONTROL: a contingency register and initial reserves.
   CONTINGENCY. Each line carries its original budget, the change orders approved against it, the amount used to date and the forecast usage to completion (blank = the budget is all spent).
   Tracked: original, approved change orders, actual usage, remaining, forecast usage and the final variance. Only the forecast usage is a cost (it is drawn on the hard-cost curve, when the
   work happens); unspent contingency is never funded. When a register is entered it replaces the % contingency inside the hard-cost ladder, so contingency is never counted twice.
   RESERVES. Each reserve is funded in a month, held as cash, and has a purpose: operating (pays the shortfall when property income does not cover the operating costs), interest (pays interest
   the facility ceiling cannot capitalise) or general (covers either, after the specific reserve). What is not used is released to the project at the sale. Funded reserves are not expenses.
   Everything is stored in the deal (_contingency, _reserves) so it travels, versions and undoes with it.
   =========================================================================== */
(function(){
'use strict';
if(typeof bkLoad !== 'function') return;
function num(v){ var n = Number(v); return isFinite(n) ? n : 0; }
function esc(t){ return String(t == null ? '' : t).replace(/[&<>"]/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]; }); }
function isDev(s){ return /develop/i.test(String((s && s.dealType) || '')); }
function cur(){ return typeof currentSheet !== 'undefined' ? currentSheet : 'Deal Underwrite'; }
var PURPOSES = [['operating', 'Operating / lease-up'], ['interest', 'Debt service / interest'], ['general', 'General liquidity']];

window.bkDevContingency = function(s){
  s = s || bkLoad(); var raw = (s._contingency && Array.isArray(s._contingency.items)) ? s._contingency.items : [];
  var items = raw.map(function(t){ var budget = Math.max(0, num(t.budget)), used = Math.max(0, num(t.used)), co = Math.max(0, num(t.changeOrders)), hasF = t.forecast !== undefined && t.forecast !== null && t.forecast !== '';
    var forecast = Math.max(used, hasF ? Math.max(0, num(t.forecast)) : budget); return { name:String(t.name || ''), budget:budget, changeOrders:co, used:used, forecast:forecast, variance:budget - forecast, remaining:budget - used }; })
    .filter(function(t){ return t.budget > 0 || t.forecast > 0 || t.name; });
  var sum = function(k){ return items.reduce(function(a, t){ return a + t[k]; }, 0); };
  var o = { on:items.some(function(t){ return t.budget > 0 || t.forecast > 0; }), items:items, original:sum('budget'), changeOrders:sum('changeOrders'), used:sum('used'), forecast:sum('forecast') };
  o.remaining = o.original - o.used; o.variance = o.original - o.forecast; o.overrun = Math.max(0, o.forecast - o.original); o.spend = o.on ? o.forecast : 0; return o;
};
window.bkDevReserves = function(s){
  s = s || bkLoad(); var raw = Array.isArray(s._reserves) ? s._reserves : [];
  var items = raw.map(function(t){ var p = PURPOSES.some(function(q){ return q[0] === t.purpose; }) ? t.purpose : 'general'; return { name:String(t.name || ''), amount:Math.max(0, num(t.amount)), month:Math.max(1, Math.round(num(t.month)) || 1), purpose:p }; })
    .filter(function(t){ return t.amount > 0; });
  var byMonth = {}, tot = { operating:0, interest:0, general:0 };
  items.forEach(function(t){ var m = byMonth[t.month] = byMonth[t.month] || { operating:0, interest:0, general:0 }; m[t.purpose] += t.amount; tot[t.purpose] += t.amount; });
  return { on:items.length > 0, items:items, byMonth:byMonth, total:items.reduce(function(a, t){ return a + t.amount; }, 0), byPurpose:tot };
};

/* ---- editing ---- */
function save(s){ bkSave(s); if(typeof showSheet === 'function') showSheet(cur()); }
function clean(raw){ var t = String(raw == null ? '' : raw).replace(/[$,\s]/g, ''); if(t === '') return ''; var n = Number(t); return isFinite(n) ? n : null; }
window.bkContAdd = function(){ var s = bkLoad(), c = s._contingency = Object.assign({}, s._contingency || {}); c.items = (c.items || []).concat([{ name:'', budget:0, changeOrders:0, used:0, forecast:'' }]); save(s); };
window.bkContRemove = function(i){ var s = bkLoad(), c = s._contingency = Object.assign({}, s._contingency || {}); c.items = (c.items || []).filter(function(_, k){ return k !== i; }); save(s); };
window.bkContField = function(i, key, raw){ var s = bkLoad(), c = s._contingency = Object.assign({}, s._contingency || {}), T = c.items = (c.items || []).map(function(t){ return Object.assign({}, t); }), t = T[i]; if(!t) return;
  if(key === 'name') t.name = String(raw || '').trim(); else { var n = clean(raw); if(n === null || (n !== '' && n < 0)){ showSheet(cur()); return; } t[key] = n; } save(s); };
window.bkRsvAdd = function(){ var s = bkLoad(); s._reserves = (Array.isArray(s._reserves) ? s._reserves : []).concat([{ name:'', amount:0, month:1, purpose:'general' }]); save(s); };
window.bkRsvRemove = function(i){ var s = bkLoad(); s._reserves = (Array.isArray(s._reserves) ? s._reserves : []).filter(function(_, k){ return k !== i; }); save(s); };
window.bkRsvField = function(i, key, raw){ var s = bkLoad(), T = s._reserves = (Array.isArray(s._reserves) ? s._reserves : []).map(function(t){ return Object.assign({}, t); }), t = T[i]; if(!t) return;
  if(key === 'name' || key === 'purpose') t[key] = String(raw || '').trim(); else { var n = clean(raw); if(n === null || n < 0){ showSheet(cur()); return; } t[key] = n === '' ? 0 : (key === 'month' ? Math.max(1, Math.round(n)) : n); } save(s); };

/* ---- the two panels on Deal Underwrite (development deals; N/A on an acquisition) ---- */
function money(v){ return (v < 0 ? '($' : '$') + Math.abs(Math.round(v)).toLocaleString('en-US') + (v < 0 ? ')' : ''); }
function cell(fn, i, key, v, text, w){ return '<td class="v"><input type="' + (text ? 'text' : 'number') + '" step="any" style="' + (w ? 'width:' + w + 'px;' : '') + (text ? 'text-align:left !important' : '') + '" value="' + esc(v === 0 || v === '' || v == null ? '' : v) + '" placeholder="' + (text ? 'Name' : '0') + '" onchange="' + fn + '(' + i + ',\'' + key + '\',this.value)"></td>'; }
function panels(){
  var s = bkLoad(), cg = window.bkDevContingency(s), raw = (s._contingency && s._contingency.items) || [], rs = window.bkDevReserves(s), rraw = Array.isArray(s._reserves) ? s._reserves : [];
  var rows = raw.map(function(t, i){ var n = cg.items[i]; return '<tr data-bk-nokey="1">' + cell('bkContField', i, 'name', t.name, true, 190) + cell('bkContField', i, 'budget', t.budget) + cell('bkContField', i, 'changeOrders', t.changeOrders) + cell('bkContField', i, 'used', t.used) + cell('bkContField', i, 'forecast', t.forecast)
    + '<td>' + (n ? money(n.remaining) : '-') + '</td><td>' + (n ? money(n.variance) : '-') + '</td><td><button type="button" class="status-chip" onclick="bkContRemove(' + i + ')">Remove</button></td></tr>'; }).join('');
  var contT = '<div class="tbl-wrap" style="margin-top:16px"><table class="fin"><caption>Development - Contingency Register</caption><thead><tr><th class="rowlabel-h">Category</th><th>Original budget</th><th>Approved change orders</th><th>Used to date</th><th>Forecast usage</th><th>Remaining</th><th>Final variance</th><th></th></tr></thead><tbody>' + (rows || '<tr><td class="rowlabel" colspan="8">No register: contingency is the % inside the hard-cost ladder. Add categories to track contingency separately.</td></tr>')
    + (cg.on ? '<tr class="grandtotal"><td class="rowlabel">TOTAL</td><td>' + money(cg.original) + '</td><td>' + money(cg.changeOrders) + '</td><td>' + money(cg.used) + '</td><td>' + money(cg.forecast) + '</td><td>' + money(cg.remaining) + '</td><td>' + money(cg.variance) + '</td><td></td></tr>' : '') + '</tbody></table>'
    + '<div class="note-flag"><span>&#9432;</span><div><b>How it works.</b> Only the <b>forecast usage</b> is a cost; it is drawn on the hard-cost curve. Leave it blank and the whole budget is forecast to be used. Unspent contingency (the final variance) is never funded. With a register entered, the % contingency in the hard-cost ladder is not used, so nothing is counted twice. <button type="button" class="status-chip" onclick="bkContAdd()">+ Add category</button></div></div></div>';
  var rrows = rraw.map(function(t, i){ return '<tr data-bk-nokey="1">' + cell('bkRsvField', i, 'name', t.name, true, 190) + cell('bkRsvField', i, 'amount', t.amount) + cell('bkRsvField', i, 'month', t.month)
    + '<td class="v"><select onchange="bkRsvField(' + i + ',\'purpose\',this.value)">' + PURPOSES.map(function(p){ return '<option value="' + p[0] + '"' + ((t.purpose || 'general') === p[0] ? ' selected' : '') + '>' + p[1] + '</option>'; }).join('') + '</select></td><td><button type="button" class="status-chip" onclick="bkRsvRemove(' + i + ')">Remove</button></td></tr>'; }).join('');
  var rsvT = '<div class="tbl-wrap" style="margin-top:16px"><table class="fin"><caption>Development - Initial Reserves</caption><thead><tr><th class="rowlabel-h">Reserve</th><th>Amount</th><th>Funded in month</th><th>Purpose</th><th></th></tr></thead><tbody>' + (rrows || '<tr><td class="rowlabel" colspan="5">No reserves entered.</td></tr>')
    + (rs.on ? '<tr class="grandtotal"><td class="rowlabel">TOTAL FUNDED</td><td>' + money(rs.total) + '</td><td></td><td></td><td></td></tr>' : '') + '</tbody></table>'
    + '<div class="note-flag"><span>&#9432;</span><div><b>How it works.</b> A reserve is funded in its month as part of the project cost, held as cash, and is not an expense. An <b>operating</b> reserve pays the shortfall when property income does not cover operating costs; an <b>interest</b> reserve pays interest the facility ceiling cannot capitalise; <b>general</b> reserves cover either after the specific one. Whatever is not used is released to the project at the sale. <button type="button" class="status-chip" onclick="bkRsvAdd()">+ Add reserve</button></div></div></div>';
  return contT + rsvT;
}
var prev = typeof sheetDealUnderwrite === 'function' ? sheetDealUnderwrite : null;
if(prev && !prev.__bkBudget){ var wrapped = function(){ var o = prev(); try { if(isDev(bkLoad())) o.main += panels(); else o.main += panels(); } catch(e){} return o; }; wrapped.__bkBudget = true; sheetDealUnderwrite = wrapped; }
})();
