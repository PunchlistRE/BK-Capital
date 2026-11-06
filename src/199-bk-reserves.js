/* ACQUISITION RESERVE ACCOUNTS (1.3). Money set aside at closing for renovation, common-area capex and interest, and drawn as each is spent. A memo page: it shows how much is funded, what each account is drawn for, the balance
   by year, any spend the account does not cover, and Sources & Uses and equity "including reserves". Closing equity, the Sources & Uses and funding ties, the cash flow and the returns are NOT changed (owner's choice,
   November 2026: reserve page now, returns unchanged); bringing the reserves into the engine is a separate step. The spend comes from the engines' own lines: the renovation programme (bkRenoAdj), the dated capex
   and leasing costs (bkCapexByMonth) and the loan's monthly interest (bkDebt). Only sums and a running balance are computed here. */
(function(){
'use strict';
if(typeof RENDERERS === 'undefined' || typeof bkLoad !== 'function') return;
function safe(f, d){ try { var v = f(); return v === undefined ? d : v; } catch(e){ return d; } }
function M(v){ v = Math.round(Number(v) || 0); return v < 0 ? '($' + Math.abs(v).toLocaleString('en-US') + ')' : '$' + v.toLocaleString('en-US'); }
function isDev(s){ return /develop/i.test(String((s || {}).dealType || '')); }
var ACC = [['resReno', 'Renovation reserve', 'Drawn by the unit renovation programme’s capex.'], ['resCapex', 'Common-area capex reserve', 'Drawn by the dated capex list and leasing costs.'], ['resInterest', 'Interest reserve', 'Drawn by the loan’s monthly interest, from the first month, until it runs out.']];
window.bkResSet = function(k, raw){ var v = parseFloat(String(raw).replace(/[^0-9.]/g, '')); var s = bkLoad(); s[k] = isFinite(v) && v > 0 ? v : 0; bkSave(s); if(typeof showSheet === 'function') showSheet('Reserve Accounts'); };
/* the draws by operating month, from the engines' own lines */
function spend(s){
  var hold = Math.max(1, Math.round((Number(s.holdYears) || 5) * 12)), cap = safe(function(){ return bkCapexByMonth(s, hold); }, new Array(hold).fill(0)) || [], reno = safe(function(){ return window.bkRenoAdj(s, hold, 0); }, null), d = safe(function(){ return bkDebt(); }, null);
  var interest = new Array(hold).fill(0); ((d && d.months) || []).forEach(function(m, i){ if(i < hold) interest[i] = Number(m.interest) || 0; });
  return { hold:hold, reno:new Array(hold).fill(0).map(function(_, i){ return reno ? (reno.cost[i] || 0) : 0; }), capex:cap.slice(0, hold), interest:interest, d:d };
}
function schedule(s){
  var sp = spend(s), out = [], bal = { resReno:Number(s.resReno) || 0, resCapex:Number(s.resCapex) || 0, resInterest:Number(s.resInterest) || 0 }, src = { resReno:sp.reno, resCapex:sp.capex, resInterest:sp.interest };
  var years = Math.ceil(sp.hold / 12), open = Object.assign({}, bal);
  for(var y = 1; y <= years; y++){ var row = { y:y, open:Object.assign({}, bal), draw:{ resReno:0, resCapex:0, resInterest:0 }, short:{ resReno:0, resCapex:0, resInterest:0 } };
    for(var m = (y - 1) * 12; m < Math.min(sp.hold, y * 12); m++) ACC.forEach(function(a){ var k = a[0], need = src[k][m] || 0, take = Math.min(bal[k], need); bal[k] -= take; row.draw[k] += take; row.short[k] += need - take; });
    row.close = Object.assign({}, bal); out.push(row); }
  return { rows:out, sp:sp, funded:{ resReno:open.resReno, resCapex:open.resCapex, resInterest:open.resInterest } };
}
RENDERERS['Reserve Accounts'] = function(){
  var s = bkLoad() || {}, o = { title:'Reserve Accounts', crumbs:'Debt', desc:'Money set aside at closing for renovation, capex and interest, drawn as it is spent. A memo: the returns and the funding ties are unchanged.', meta:{ Property:s.name || '' }, sidebar:'' };
  if(isDev(s)){ o.main = '<div class="note-flag"><span>&#9432;</span><div>Reserve accounts are for acquisitions. A development’s interest and cost funding is on Dev Draws and Sources & Uses.</div></div>'; return o; }
  var sch = schedule(s), tot = ACC.reduce(function(t, a){ return t + (Number(s[a[0]]) || 0); }, 0), d = sch.sp.d || {}, cap = Number(s.rateCapCost) || 0;
  var inputs = ACC.map(function(a){ var v = Number(s[a[0]]) || 0; return '<tr><td class="rowlabel">' + a[1] + '<span class="dim" style="display:block;font-size:11px">' + a[2] + '</span></td><td class="v" style="text-align:right;white-space:nowrap"><span style="color:#566a80;margin-right:6px">$</span><input type="text" value="' + (v ? Math.round(v).toLocaleString('en-US') : '') + '" placeholder="0" inputmode="decimal" style="text-align:right;width:140px !important;max-width:140px !important;min-width:0 !important" onchange="bkResSet(\'' + a[0] + '\',this.value)"></td></tr>'; }).join('');
  var main = '<div class="tbl-wrap" style="max-width:480px"><table class="fin"><caption>Reserves Funded at Closing</caption><thead><tr><th class="rowlabel-h">Account</th><th>Funded at closing</th></tr></thead><tbody>' + inputs + '<tr class="grandtotal"><td class="rowlabel">Total reserves</td><td style="text-align:right">' + M(tot) + '</td></tr></tbody></table></div>';
  if(!(tot > 0)){ o.main = main + '<div class="note-flag"><span>&#9432;</span><div>Enter the amount of each reserve to see its draws and balance by year.</div></div>'; return o; }
  var head = '<th class="rowlabel-h">Account</th>' + sch.rows.map(function(r){ return '<th>Year ' + r.y + '</th>'; }).join('');
  var line = function(lbl, f, cls){ return '<tr' + (cls ? ' class="' + cls + '"' : '') + '><td class="rowlabel">' + lbl + '</td>' + sch.rows.map(function(r){ return '<td>' + M(f(r)) + '</td>'; }).join('') + '</tr>'; };
  var body = ACC.filter(function(a){ return Number(s[a[0]]) > 0; }).map(function(a){ var k = a[0]; return line(a[1] + ': drawn', function(r){ return -r.draw[k]; }) + line(a[1] + ': balance', function(r){ return r.close[k]; }, 'subtotal') + (sch.rows.some(function(r){ return r.short[k] > 0.5; }) ? line(a[1] + ': spend beyond the reserve', function(r){ return r.short[k]; }) : ''); }).join('');
  main += '<div class="tbl-wrap" style="margin-top:16px"><table class="fin"><caption>Draws and Balances by Year</caption><thead><tr>' + head + '</tr></thead><tbody>' + body + line('Total reserve balance', function(r){ return r.close.resReno + r.close.resCapex + r.close.resInterest; }, 'grandtotal') + '</tbody></table></div>';
  var last = sch.rows[sch.rows.length - 1] || { close:{ resReno:0, resCapex:0, resInterest:0 } }, unused = last.close.resReno + last.close.resCapex + last.close.resInterest, eq = (Number(d.equity) || 0) + cap;
  main += '<div class="tbl-wrap" style="margin-top:16px"><table class="fin"><caption>Equity Including Reserves (memo)</caption><tbody>'
    + '<tr><td class="rowlabel">Closing equity, as in Sources &amp; Uses</td><td class="v">' + M(eq) + '</td></tr><tr><td class="rowlabel">Add: reserves funded at closing</td><td class="v">' + M(tot) + '</td></tr>'
    + '<tr class="grandtotal"><td class="rowlabel">Equity at closing including reserves</td><td class="v">' + M(eq + tot) + '</td></tr>'
    + '<tr><td class="rowlabel">Reserve cash unused at the end of the hold</td><td class="v">' + M(unused) + '</td></tr></tbody></table></div>'
    + '<div class="note-flag"><span>&#9432;</span><div>This page is a memo. The deal’s closing equity, Sources &amp; Uses, cash flow and returns do not include these reserves, and the spend shown is already in the cash flow as capex and interest. Treating reserves as a closing use (more equity in, less spend out of operations) is a separate change to the funding ties and the returns.</div></div>';
  o.main = main; o.meta['Reserves'] = M(tot); o.meta['Unused at exit'] = M(unused); return o;
};
})();
