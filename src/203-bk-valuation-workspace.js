/* ============================================================================================
   VALUATION WORKSPACE: PV, NPV and FV in every deal (Reports > Present Value Report, below the report tables).
   Presentation and persistence only: every number comes from the valuation engine (src/202) over the deal's own dated monthly
   cash flows. It never builds a schedule or a formula of its own.
     1. Measures      Unleveraged PV -> Property NPV -> Leveraged PV -> Equity NPV -> FV, side by side, each defined in place
     2. Pricing       NPV at a proposed price, and the maximum supportable price (the whole deal re-run at every trial price)
     3. Sensitivity   the same measures at five discount rates
     4. Scenarios     saved to the deal, append-only, each with the snapshot needed to rebuild its result exactly
   Saved scenarios live on the deal record (_valScen), so they travel with the deal (storage, sync, version history).
   ============================================================================================ */
(function(){
var KEY = 'bkcapital.val.ui.v1', SHEET = 'Present Value Report', ui = (function(){ try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch(e){ return {}; } })(), solved = null, openId = null, busy = false;
function saveUi(){ try { localStorage.setItem(KEY, JSON.stringify(ui)); } catch(e){} }
function esc(v){ return String(v == null ? '' : v).replace(/[&<>"]/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]; }); }
function money(n){ n = Number(n); if(!isFinite(n)) return '-'; var a = Math.round(Math.abs(n)).toLocaleString('en-US'); return Math.round(n) < 0 ? '($' + a + ')' : '$' + a; }
function pct(n, d){ n = Number(n); return isFinite(n) ? (n * 100).toFixed(d == null ? 2 : d) + '%' : '-'; }
function parsePct(raw){ var str = String(raw).trim(), v = parseFloat(str.replace(/[%,\s]/g, '')); if(!isFinite(v)) return null; return /%/.test(str) || Math.abs(v) >= 1 ? v / 100 : v; }
function rerender(){ if(typeof showSheet === 'function') showSheet(SHEET); }
function isDev(s){ return /develop/i.test(String((s || {}).dealType || '')); }
function chip(v, pos, neg){ return '<span class="status-chip ' + (v > 1 ? 'pass' : v < -1 ? 'fail' : '') + '">' + (v > 1 ? pos : v < -1 ? neg : 'About zero') + '</span>'; }

/* the inputs in force: what the user set, else the report's middle discount rate */
function inputs(s){
  var base; try { base = window.bkPvCalc(s, typeof window.bkRpOptGet === 'function' ? window.bkRpOptGet('pvRate') : undefined).base; } catch(e){ base = 0.09; }
  var rate = ui.rate != null ? ui.rate : base, er = ui.equityRate != null ? ui.equityRate : rate, ar = ui.accumRate != null ? ui.accumRate : er;
  return { rate:rate, equityRate:er, accumRate:ar, fvDate:ui.fvDate || null, price:ui.price != null ? ui.price : Number(s.purchasePrice) || 0 };
}
function valuate(i){ return window.bkValuate({ rate:i.rate, equityRate:i.equityRate, accumRate:i.accumRate, fvDate:i.fvDate || undefined }); }
function atPrice(i, P){ return window.bkRunWith({ purchasePrice:P }, function(){ var v = valuate(i), d = window.bkDebt ? window.bkDebt() : {}; return { v:v, loan:Number(d.loan) || 0, equity:Number(d.equity) || 0 }; }); }

window.bkValUi = function(k, raw){
  if(k === 'rate' || k === 'equityRate' || k === 'accumRate'){ var v = parsePct(raw); ui[k] = raw === '' || v == null ? null : v; }
  else if(k === 'price'){ var n = parseFloat(String(raw).replace(/[$,\s]/g, '')); ui.price = isFinite(n) && n > 0 ? n : null; }
  else if(k === 'fvDate'){ ui.fvDate = raw || null; }
  else if(k === 'reset'){ ui = {}; }
  solved = null; saveUi(); rerender();
};
window.bkValSolve = function(){
  if(busy) return; busy = true; var s = bkLoad(), i = inputs(s), el = document.getElementById('bk-val-solve'); if(el) el.textContent = 'Solving: re-running the whole deal at each trial price...';
  setTimeout(function(){ try { solved = { forInputs:JSON.stringify([i.rate, i.equityRate]), property:window.bkValMaxPrice('property', i.rate, i.equityRate), equity:window.bkValMaxPrice('equity', i.equityRate, i.equityRate) };
    ['property', 'equity'].forEach(function(k){ var r = solved[k]; if(r && r.ok){ var a = atPrice(i, r.price); r.loan = a.loan; r.closingEquity = a.equity; } }); } catch(e){ solved = { error:String(e && e.message || e) }; } busy = false; rerender(); }, 30);
};
window.bkValCsv = function(){
  var f = window.bkValDealFlows(), rows = ['Date,Property cash flow (unleveraged),Equity cash flow (leveraged)'];
  if(f.development){ f.equity.forEach(function(x){ rows.push(x.date + ',,' + x.amount.toFixed(2)); }); }
  else f.unlevered.forEach(function(x, k){ rows.push(x.date + ',' + x.amount.toFixed(2) + ',' + f.equity[k].amount.toFixed(2)); });
  var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([rows.join('\n')], { type:'text/csv' })); a.download = 'valuation-cash-flows.csv'; document.body.appendChild(a); a.click(); setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 500);
};

/* ---------- scenarios: append-only, reproducible ---------- */
function fnv(str){ var h = 0x811c9dc5; for(var k = 0; k < str.length; k++){ h ^= str.charCodeAt(k); h = (h * 0x01000193) >>> 0; } return ('00000000' + h.toString(16)).slice(-8); }
function assumptionsOf(s){ var o = {}; Object.keys(s).forEach(function(k){ if(k.charAt(0) !== '_' && k !== 'photo') o[k] = s[k]; }); return JSON.parse(JSON.stringify(o)); }
function dealScen(s){ return Array.isArray(s._valScen) ? s._valScen : []; }
window.bkValScenSave = function(name){
  var s = bkLoad(), i = inputs(s), res = valuate(i), flows = window.bkValDealFlows();
  var rec = { id:'vs_' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36), name:String(name || '').trim() || ('Scenario ' + (dealScen(s).length + 1)), createdAt:new Date().toISOString(), stage:String(s.status || 'Pipeline'),
    engineVersion:window.bkValEngineVersion, inputs:{ rate:i.rate, equityRate:i.equityRate, accumRate:i.accumRate, fvDate:i.fvDate, price:i.price }, assumptions:assumptionsOf(s), cashFlows:{ unlevered:flows.unlevered, equity:flows.equity, valuationDate:flows.valuationDate, saleDate:flows.saleDate }, results:res };
  rec.hash = fnv(JSON.stringify([rec.inputs, rec.cashFlows, rec.results, rec.engineVersion]));
  if(solved && !solved.error && solved.forInputs === JSON.stringify([i.rate, i.equityRate])) rec.maxPrice = { property:solved.property, equity:solved.equity };
  var s2 = bkLoad(); s2._valScen = dealScen(s2).concat([rec]); bkSave(s2); openId = rec.id; rerender(); return rec;
};
/* rebuild a saved scenario's results from its own snapshot (not from today's deal) */
window.bkValScenRebuild = function(rec){
  var i = rec.inputs, over = Object.assign({}, rec.assumptions, { purchasePrice:i.price });
  return window.bkRunWith(over, function(){ return window.bkValuate({ rate:i.rate, equityRate:i.equityRate, accumRate:i.accumRate, fvDate:i.fvDate || undefined }); });
};
window.bkValScenCheck = function(rec){
  var re = window.bkValScenRebuild(rec), keys = ['unleveragedPV', 'propertyNPV', 'leveragedPV', 'equityNPV', 'fvEquity', 'fvUnlevered'], bad = [];
  keys.forEach(function(k){ var a = rec.results[k], b = re[k]; if((a == null) !== (b == null) || (a != null && Math.abs(a - b) > 0.5)) bad.push(k); });
  var hashOk = fnv(JSON.stringify([rec.inputs, rec.cashFlows, rec.results, rec.engineVersion])) === rec.hash;
  return { reproduced:bad.length === 0, differs:bad, hashOk:hashOk, rebuilt:re };
};
window.bkValScenOpen = function(id){ var s = bkLoad(), rec = dealScen(s).filter(function(r){ return r.id === id; })[0]; if(!rec) return; openId = id; ui.rate = rec.inputs.rate; ui.equityRate = rec.inputs.equityRate; ui.accumRate = rec.inputs.accumRate; ui.fvDate = rec.inputs.fvDate; ui.price = rec.inputs.price; saveUi(); rerender(); };
window.bkValScenSaveForm = function(){ var el = document.getElementById('bk-val-name'); window.bkValScenSave(el ? el.value : ''); };

/* ---------- the panel ---------- */
function panel(s){
  var dev = isDev(s), i = inputs(s), v, f, err = '';
  try { v = valuate(i); f = window.bkValDealFlows(); } catch(e){ return '<div class="rp-sec">Valuation workspace</div><div class="ae-hint">The valuation could not be built for this deal yet: ' + esc(e && e.message || e) + '. Finish the required inputs first.</div>'; }
  var inp = function(k, val, w, ph){ return '<input class="ae-in" style="width:' + (w || 96) + 'px;text-align:right" value="' + esc(val) + '" placeholder="' + esc(ph || '') + '" onchange="bkValUi(\'' + k + '\', this.value)">'; };
  var ctl = '<div class="ae-row" style="flex-wrap:wrap;gap:14px"><label class="ae-unit">Discount rate (property) ' + inp('rate', ui.rate != null ? pct(ui.rate) : '', 90, pct(i.rate)) + '</label><label class="ae-unit">Equity rate ' + inp('equityRate', ui.equityRate != null ? pct(ui.equityRate) : '', 90, pct(i.equityRate)) + '</label><label class="ae-unit">Accumulation rate (FV) ' + inp('accumRate', ui.accumRate != null ? pct(ui.accumRate) : '', 90, pct(i.accumRate)) + '</label><label class="ae-unit">FV date <input class="ae-in" type="date" style="width:150px" value="' + esc(ui.fvDate || '') + '" onchange="bkValUi(\'fvDate\', this.value)"></label><button type="button" class="ae-btn" onclick="bkValUi(\'reset\')">Reset</button></div><div class="ae-hint">Blank rates follow the report\'s middle discount rate (' + pct(i.rate) + ') and then each other; blank FV date is the sale date (' + esc(f.saleDate) + '). Valuation date ' + esc(f.valuationDate) + '; month-end cash flows, actual days / 365.</div>';
  var row = function(a, u, l, d, cls){ return '<tr' + (cls ? ' class="' + cls + '"' : '') + '><td>' + a + '</td><td class="r">' + u + '</td><td class="r">' + l + '</td><td class="dim" style="white-space:normal;min-width:230px">' + d + '</td></tr>'; };
  var beU = dev ? null : window.bkValBreakEvenRate('property'), beL = window.bkValBreakEvenRate('equity'), na = '<span class="dim">n/a</span>';
  var tbl = '<table class="rp-tbl" id="rp-valws"><thead><tr><th>Measure</th><th class="r">Property (unleveraged)</th><th class="r">Equity (leveraged)</th><th>What it measures</th></tr></thead><tbody>'
    + row('Present value (PV)', dev ? na : money(v.unleveragedPV), money(v.leveragedPV), dev ? 'Present value of the equity distributions and the sale at the equity rate. A development has no property-level series.' : 'Property: the cash flows before debt service plus the net sale, at the discount rate. Equity: the distributions and the sale after selling costs, the disposition fee and the loan payoff, at the equity rate. The opening loan is never added.')
    + row('Less: investment', dev ? na : money(v.basis), money(dev ? v.equityInvestmentPV : v.closingEquity), dev ? 'The present value of every equity contribution (closing and through construction).' : 'What was paid: the acquisition basis (price, closing costs, acquisition fee) and the equity paid in at closing.')
    + row('Net present value (NPV)', dev ? na : money(v.propertyNPV) + ' ' + chip(v.propertyNPV, 'Positive', 'Negative'), money(v.equityNPV) + ' ' + chip(v.equityNPV, 'Positive', 'Negative'), 'PV less the investment. Positive: the cash flows earn more than the required return. A positive PV on its own is not a positive NPV.', 'sub')
    + row('Break-even rate', beU == null ? na : pct(beU), beL == null ? na : pct(beL), 'The rate at which NPV is zero: the unleveraged IRR for the property, the levered IRR for the equity.')
    + row('Future value (FV) at ' + esc(v.fvDate), dev ? na : money(v.fvUnlevered), money(v.fvEquity), 'The dated cash flows accumulated to that date at ' + pct(v.accumRate) + (v.fvExcluded ? ' (' + v.fvExcluded + ' flow(s) dated after it are left out)' : '') + '.')
    + row('FV less the investment accumulated', dev ? na : money(v.fvUnleveredNet), money(v.fvEquityNet), 'The accumulated cash flows less the investment accumulated to the same date at the same rate.')
    + '</tbody></table>';
  /* pricing */
  var pr = atPrice(i, i.price), cur = Number(s.purchasePrice) || 0;
  var solvedOk = solved && !solved.error && solved.forInputs === JSON.stringify([i.rate, i.equityRate]);
  var solvedRow = function(label, r){ if(!r) return ''; if(!r.ok) return '<tr><td>' + label + '</td><td class="r">-</td><td colspan="2" class="dim" style="white-space:normal">' + esc(r.reason) + '</td></tr>'; return '<tr><td>' + label + '</td><td class="r"><b>' + money(r.price) + '</b></td><td class="r">' + (cur ? pct(r.price / cur - 1, 1) + ' vs ' + money(cur) : '-') + '</td><td class="dim" style="white-space:normal">At this price the loan is ' + money(r.loan) + ' and the closing equity ' + money(r.closingEquity) + ' (the deal re-run at the price); NPV there ' + money(r.npvAtPrice) + '.</td></tr>'; };
  var pricing = '<div class="ae-row" style="flex-wrap:wrap;gap:14px"><label class="ae-unit">Proposed purchase price ' + inp('price', ui.price != null ? Math.round(ui.price).toLocaleString('en-US') : '', 130, Math.round(cur).toLocaleString('en-US')) + '</label><button type="button" class="ae-btn pri" onclick="bkValSolve()">Solve maximum supportable price</button><button type="button" class="ae-btn" onclick="bkValCsv()">Download monthly cash flows (CSV)</button></div>'
    + '<table class="rp-tbl" id="rp-valprice"><thead><tr><th>At the proposed price of ' + money(i.price) + '</th><th class="r">Property (unleveraged)</th><th class="r">Equity (leveraged)</th><th>Note</th></tr></thead><tbody>'
    + row('NPV', dev ? na : money(pr.v.propertyNPV) + ' ' + chip(pr.v.propertyNPV, 'Positive', 'Negative'), money(pr.v.equityNPV) + ' ' + chip(pr.v.equityNPV, 'Positive', 'Negative'), 'The whole deal re-run at the proposed price: closing costs, loan sizing, closing equity, debt service and the exit all respond to it.')
    + row('Loan / closing equity at this price', '', money(pr.loan) + ' / ' + money(pr.equity), '')
    + '</tbody></table>'
    + '<div id="bk-val-solve" class="ae-hint">' + (solved && solved.error ? 'Could not solve: ' + esc(solved.error) : solvedOk ? '' : 'The maximum supportable price is the price at which NPV is zero, with the whole deal (costs, loan, equity, debt service, exit) re-run at every trial price. Solve it for the rates above.') + '</div>'
    + (solvedOk ? '<table class="rp-tbl" id="rp-valmax"><thead><tr><th>Maximum supportable price</th><th class="r">Price</th><th class="r">Against the entered price</th><th>Note</th></tr></thead><tbody>' + (dev ? '' : solvedRow('Property NPV = 0 at ' + pct(i.rate), solved.property)) + solvedRow('Equity NPV = 0 at ' + pct(i.equityRate), solved.equity) + '</tbody></table>' : '');
  /* sensitivity at the deal's price */
  var steps = [-0.01, -0.005, 0, 0.005, 0.01], sens = '<table class="rp-tbl" id="rp-valsens"><thead><tr><th>Discount rate</th>' + (dev ? '' : '<th class="r">Unleveraged PV</th><th class="r">Property NPV</th>') + '<th class="r">Leveraged PV</th><th class="r">Equity NPV</th></tr></thead><tbody>' + steps.map(function(d){ var x = window.bkValuate({ rate:Math.max(0.005, i.rate + d), equityRate:Math.max(0.005, i.equityRate + d), accumRate:i.accumRate, fvDate:i.fvDate || undefined }); return '<tr' + (d === 0 ? ' class="sub"' : '') + '><td>' + pct(i.rate + d) + (Math.abs(i.equityRate - i.rate) > 1e-9 ? ' / ' + pct(i.equityRate + d) : '') + '</td>' + (dev ? '' : '<td class="r">' + money(x.unleveragedPV) + '</td><td class="r">' + money(x.propertyNPV) + '</td>') + '<td class="r">' + money(x.leveragedPV) + '</td><td class="r">' + money(x.equityNPV) + '</td></tr>'; }).join('') + '</tbody></table>';
  /* scenarios */
  var list = dealScen(s), rows = list.map(function(r){ var d = new Date(r.createdAt); return '<tr' + (r.id === openId ? ' class="sub"' : '') + '><td>' + esc(r.name) + '</td><td>' + esc(d.toLocaleDateString('en-US')) + '</td><td>' + esc(r.stage) + '</td><td class="r">' + pct(r.inputs.rate) + ' / ' + pct(r.inputs.equityRate) + '</td><td class="r">' + money(r.inputs.price) + '</td><td class="r">' + (r.results.propertyNPV == null ? '-' : money(r.results.propertyNPV)) + '</td><td class="r">' + money(r.results.equityNPV) + '</td><td><button type="button" class="ae-btn" onclick="bkValScenOpen(\'' + r.id + '\')">Reopen</button></td></tr>'; }).join('');
  var detail = '', o = list.filter(function(r){ return r.id === openId; })[0];
  if(o){ var chk = window.bkValScenCheck(o), today = window.bkValuate({ rate:o.inputs.rate, equityRate:o.inputs.equityRate, accumRate:o.inputs.accumRate, fvDate:o.inputs.fvDate || undefined }), k = [['Unleveraged PV', 'unleveragedPV'], ['Property NPV', 'propertyNPV'], ['Leveraged PV', 'leveragedPV'], ['Equity NPV', 'equityNPV'], ['FV (equity)', 'fvEquity']];
    detail = '<div class="ae-hint"><b>' + esc(o.name) + '</b>: ' + (chk.reproduced ? 'rebuilt from its saved snapshot, the result is reproduced exactly' : 'the rebuilt result differs from the saved one (' + esc(chk.differs.join(', ')) + ')') + '; integrity check ' + (chk.hashOk ? 'passed' : 'FAILED') + '; engine ' + esc(o.engineVersion) + '. "Today" uses the same rates on the deal as it stands now.</div>'
      + '<table class="rp-tbl"><thead><tr><th>' + esc(o.name) + '</th><th class="r">Saved</th><th class="r">Rebuilt from snapshot</th><th class="r">Today</th><th class="r">Today less saved</th></tr></thead><tbody>' + k.map(function(m){ var a = o.results[m[1]], b = chk.rebuilt[m[1]], c = today[m[1]]; return '<tr><td>' + m[0] + '</td><td class="r">' + (a == null ? '-' : money(a)) + '</td><td class="r">' + (b == null ? '-' : money(b)) + '</td><td class="r">' + (c == null ? '-' : money(c)) + '</td><td class="r">' + (a == null || c == null ? '-' : money(c - a)) + '</td></tr>'; }).join('') + '</tbody></table>'; }
  var scen = '<div class="ae-row" style="flex-wrap:wrap;gap:10px"><input id="bk-val-name" class="ae-in" style="width:280px !important;max-width:100% !important" placeholder="Name this scenario, e.g. Base at 8.75%"><button type="button" class="ae-btn pri" onclick="bkValScenSaveForm()">Save scenario to this deal</button></div><div class="ae-hint">A saved scenario keeps its rates, the price, the cash flows and the deal assumptions it was built on, so it can be reopened and rebuilt exactly later even after the deal changes. Scenarios are never overwritten or deleted.</div>'
    + (list.length ? '<table class="rp-tbl" id="rp-valscen"><thead><tr><th>Scenario</th><th>Saved</th><th>Deal stage</th><th class="r">Property / equity rate</th><th class="r">Price</th><th class="r">Property NPV</th><th class="r">Equity NPV</th><th></th></tr></thead><tbody>' + rows + '</tbody></table>' : '<div class="ae-hint">No scenarios saved yet.</div>') + detail;
  var def = '<div class="ae-hint"><b>Reading these:</b> Unleveraged PV is the value of the property-level cash flows. Property NPV is that value less what was paid for the property. Leveraged PV is the value of what equity receives. Equity NPV is that value less the equity invested. FV accumulates the dated cash flows to a chosen date. Positive NPV, not a large PV, is what says the price is below value at the required return.</div>';
  return '<div class="rp-sec">Valuation workspace: PV, NPV and FV</div>' + ctl + tbl + def + '<div class="rp-sec">Pricing: what can be paid for these cash flows</div>' + pricing + '<div class="rp-sec">Sensitivity to the discount rate</div>' + sens + '<div class="rp-sec">Saved valuation scenarios</div>' + scen;
}

var prev = RENDERERS[SHEET];
if(typeof prev === 'function') RENDERERS[SHEET] = function(){
  var o = prev.apply(this, arguments); if(!o || typeof o.main !== 'string') return o;
  var s = bkLoad(), html; try { html = panel(s); } catch(e){ html = '<div class="rp-sec">Valuation workspace</div><div class="ae-hint">Not available yet: ' + esc(e && e.message || e) + '</div>'; }
  var k = o.main.lastIndexOf('</div>'); /* inside the report's wrapper so it shares the report styling */
  o.main = k >= 0 && /class="ae rp"/.test(o.main) ? o.main.slice(0, k) + '<div class="rp-ws">' + html + '</div>' + o.main.slice(k) : o.main + '<div class="ae rp"><div class="rp-ws">' + html + '</div></div>';
  return o;
};
})();
