
/* Financing Lab: buy the active property today at a market cap rate and try financing structures. Every cell is a full rerun of the underwriting engine on a scratch copy
   (bkRunWith), so nothing on the deal changes. Debt is sized by LTV alone here (DSCR and cost limits are lifted) and the coverage that results is shown and flagged against policy. */
(function(){
'use strict';
if(typeof RENDERERS === 'undefined' || typeof window.bkRunWith !== 'function' || typeof window.bkProFormaKit !== 'object') return;
var K = window.bkProFormaKit, P = K.P, X = K.X, M = K.M, esc = K.esc;
function safe(f, d){ try { var v = f(); return v === undefined ? d : v; } catch(e){ return d; } }
function active(){ return typeof window.bkHasActiveDeal !== 'function' || window.bkHasActiveDeal(); }
var LTVS = [0.50, 0.55, 0.60, 0.65, 0.70, 0.75], RATES = [0.05, 0.055, 0.06, 0.065, 0.07, 0.075, 0.08];
var st = { cap:null, exit:null, rg:null, og:null, metric:'irr', ltv:0.65, rate:null, dealKey:'' };

function base(){
  var s = bkLoad(), calc = safe(function(){ return bkCalc(); }, {}), noi = Number(calc.noi) || 0;
  var price0 = Number(s.purchasePrice) || 0, cap0 = price0 && noi ? noi / price0 : (Number(s.exitCap) || 0.06);
  var key = String(s.dealId) + '|' + price0;
  if(st.dealKey !== key){ st.dealKey = key; st.cap = null; st.exit = null; st.rate = null; st.rg = null; st.og = null; }
  return { s:s, noi:noi, cap:st.cap == null ? cap0 : st.cap, cap0:cap0, exit:st.exit == null ? (Number(s.exitCap) || cap0) : st.exit, rate:st.rate == null ? (Number(s.acqRate) || 0.0675) : st.rate, rg:st.rg == null ? Number(s.rentGrowth) : st.rg, og:st.og == null ? Number(s.opexGrowth) : st.og };
}
function run(B, ov){
  return safe(function(){ return window.bkInCase(function(){ return window.bkRunWith(Object.assign({ purchasePrice:B.noi / B.cap, exitCap:B.exit, rentGrowth:B.rg, opexGrowth:B.og, debtRateType:'Fixed' }, ov), function(){ var D = K.build(); if(!D) return null; return { irr:D.irr, moic:D.moic, dscr:D.Y[0].dscr, coc:D.Y[0].coc, loan:D.d.loan, eq:D.eq, uirr:D.u.irr, price:D.price }; }); }); }, null);
}
function lev(B, ltv, rate, extra){ return run(B, Object.assign({ acqLTV:ltv, acqLTC:1, acqDSCR:0.01, acqDebtYield:0, acqRate:rate, debtEnabled:true }, extra || {})); }
function unlev(B){ return run(B, { debtEnabled:false }); }

window.bkFinLabSet = function(k, v){ v = Number(v); if(!isFinite(v)) return; if(k === 'cap' || k === 'exit' || k === 'rate' || k === 'rg' || k === 'og') st[k] = v / 100; else if(k === 'ltv') st.ltv = v / 100; showSheet('Financing Lab'); };
window.bkFinLabMetric = function(m){ st.metric = m; showSheet('Financing Lab'); };
window.bkFinLabReset = function(){ st.cap = st.exit = st.rate = st.rg = st.og = null; showSheet('Financing Lab'); };
/* for tests and reports: the grid as data */
window.bkFinLabData = function(){
  if(!active()) return null; var B = base(), pol = safe(function(){ return bkPolicy(); }, {}) || {}, u = unlev(B);
  var grid = LTVS.map(function(l){ return RATES.map(function(r){ return lev(B, l, r); }); });
  return { B:B, u:u, grid:grid, ltvs:LTVS, rates:RATES, minDSCR:Number(pol.minDSCR) || 1.25, hurdle:Number(pol.targetIRR) || 0.12 };
};

function cellColor(metric, v, L){
  if(v == null || !isFinite(v)) return '#eef1f4';
  var t; if(metric === 'irr') t = (v - L.u.irr) / 0.06; else if(metric === 'dscr') t = (v - L.minDSCR) / 0.5; else if(metric === 'coc') t = (v - 0.04) / 0.08; else t = (v - L.u.moic) / 0.5;
  t = Math.max(-1, Math.min(1, t)); var c0 = [226, 96, 77], c1 = [255, 247, 224], c2 = [63, 178, 127], a = t < 0 ? c0 : c1, b = t < 0 ? c1 : c2, u = t < 0 ? 1 + t : t;
  if(t >= 0){ a = c1; b = c2; u = t; } else { a = c0; b = c1; u = 1 + t; }
  return 'rgb(' + [0, 1, 2].map(function(i){ return Math.round(a[i] + (b[i] - a[i]) * u); }).join(',') + ')';
}
function fmt(metric, r){ if(!r) return '—'; var v = r[metric]; if(v == null || !isFinite(v)) return '—'; return metric === 'dscr' || metric === 'moic' ? X(v) : P(v, 1); }
function box(h){ return '<div style="background:var(--surface,#fff);border:1px solid var(--line,#dbe4ec);border-radius:8px;padding:14px 16px;margin-top:12px;font-size:13px;line-height:1.55;max-width:1000px">' + h + '</div>'; }

function render(){
  var s = safe(function(){ return bkLoad(); }, null), hdr = { title:'Financing Lab', crumbs:'Debt', desc:'Buy this property today at a market cap rate and try different loans. Nothing here changes the deal.', sidebar:'', meta:{ Property:s && s.name } };
  if(!s || /develop/i.test(String(s.dealType || ''))){ hdr.main = box('The Financing Lab covers acquisition deals. A development deal is financed by a construction loan and a takeout, which the Debt sheets already model.'); return hdr; }
  var L = window.bkFinLabData(); if(!L || !L.u){ hdr.main = box('The lab could not run for this deal.'); return hdr; }
  var B = L.B, m = st.metric, T = 'width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums';
  var inp = function(label, key, val){ return '<label style="display:flex;flex-direction:column;gap:3px;font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;font-weight:700;opacity:.8">' + label + '<input type="number" step="0.05" value="' + (val * 100).toFixed(2) + '" onchange="bkFinLabSet(\'' + key + '\',this.value)" style="width:110px;padding:7px 9px;border:1px solid var(--line,#dbe4ec);border-radius:6px;font:inherit;font-size:14px;text-align:right"></label>'; };
  var btn = function(k, t){ return '<button type="button" class="pl-hbtn' + (m === k ? ' primary' : '') + '" onclick="bkFinLabMetric(\'' + k + '\')">' + t + '</button>'; };
  var main = box('<div style="display:flex;gap:16px;flex-wrap:wrap;align-items:flex-end">' + inp('Purchase cap rate %', 'cap', B.cap) + inp('Exit cap rate %', 'exit', B.exit) + inp('Rent growth %', 'rg', B.rg) + inp('Expense growth %', 'og', B.og) + '<div style="font-size:13px;padding-bottom:6px">Price = Year-1 NOI ' + M(B.noi) + ' ÷ ' + P(B.cap, 2) + ' = <b>' + M(B.noi / B.cap) + '</b>' + (Number(B.s.units) ? ' (' + K.F(B.noi / B.cap / Number(B.s.units)) + ' per unit)' : '') + '</div><button type="button" class="pl-hbtn" onclick="bkFinLabReset()">Reset to the deal</button></div><div style="font-size:12px;opacity:.7;margin-top:8px">The deal itself is priced at ' + P(B.cap0, 2) + ' on its entered price. Unlevered, this purchase returns <b>' + P(L.u.irr, 1) + '</b> (' + X(L.u.moic) + ').</div>');
  var head = '<tr><th style="text-align:left;padding:6px 8px;font-size:10.5px;letter-spacing:.08em;text-transform:uppercase">LTV \\ Rate</th>' + RATES.map(function(r){ return '<th style="padding:6px 8px;font-size:11px;text-align:center;border-bottom:2px solid #0e2a4a">' + P(r, 2) + '</th>'; }).join('') + '</tr>';
  var rows = L.grid.map(function(row, i){ return '<tr><td style="padding:6px 8px;font-weight:700;border-right:2px solid #0e2a4a">' + P(LTVS[i], 0) + '</td>' + row.map(function(c){ var warn = c && c.dscr < L.minDSCR; return '<td style="padding:9px 6px;text-align:center;font-weight:600;color:#14283d;background:' + cellColor(m, c && c[m], L) + ';border:2px solid #fff;border-radius:6px;' + (warn && m !== 'dscr' ? 'outline:1.5px dashed #b23a2c;outline-offset:-4px' : '') + '" title="' + (c ? 'Loan ' + M(c.loan) + ' · equity ' + M(c.eq) + ' · DSCR ' + X(c.dscr) + ' · IRR ' + P(c.irr, 1) : '') + '">' + fmt(m, c) + '</td>'; }).join('') + '</tr>'; }).join('');
  main += box('<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px"><b style="margin-right:6px">Show</b>' + btn('irr', 'Levered IRR') + btn('dscr', 'Year-1 DSCR') + btn('coc', 'Year-1 cash-on-cash') + btn('moic', 'Equity multiple') + '</div><div style="overflow-x:auto"><table style="' + T + ';min-width:520px">' + head + rows + '</table></div><div style="font-size:12px;opacity:.75;margin-top:8px">Rows: loan-to-value on price. Columns: fixed interest rate, 30-year amortisation unless the deal says otherwise. Green beats the unlevered return (or the ' + X(L.minDSCR) + ' coverage minimum), red falls short. A dashed red outline marks loans whose Year-1 coverage is below the ' + X(L.minDSCR) + ' policy minimum. Hover a cell for the loan and equity.</div>');
  /* where does leverage stop helping */
  var lt = st.ltv, be = null, prev = null;
  for(var r = 0.04; r <= 0.1001; r += 0.0025){ var c = lev(B, lt, r); if(!c) continue; var d = c.irr - L.u.irr; if(prev && prev.d > 0 && d <= 0){ be = prev.r + (r - prev.r) * prev.d / (prev.d - d); break; } prev = { r:r, d:d }; }
  var ref = lev(B, lt, B.rate);
  /* structure comparison */
  var structs = [['30-year amortisation', 30, 0], ['25-year amortisation', 25, 0], ['Interest-only 2 years, then 30-year', 30, 2], ['Interest-only for the whole hold', 30, Number(B.s.holdYears) || 5]];
  var srows = structs.map(function(t){ var c = lev(B, lt, B.rate, { acqAmort:t[1], acqIO:t[2] }); return '<tr><td style="padding:6px 8px">' + t[0] + '</td><td style="padding:6px 8px;text-align:right">' + (c ? M(c.loan) : '—') + '</td><td style="padding:6px 8px;text-align:right">' + (c ? M(c.eq) : '—') + '</td><td style="padding:6px 8px;text-align:right">' + (c ? X(c.dscr) : '—') + '</td><td style="padding:6px 8px;text-align:right">' + (c ? P(c.coc, 1) : '—') + '</td><td style="padding:6px 8px;text-align:right;font-weight:700">' + (c ? P(c.irr, 1) : '—') + '</td><td style="padding:6px 8px;text-align:right">' + (c ? X(c.moic) : '—') + '</td></tr>'; }).join('');
  var th = function(t, left){ return '<th style="padding:6px 8px;font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;border-bottom:2px solid #0e2a4a;text-align:' + (left ? 'left' : 'right') + '">' + t + '</th>'; };
  main += box('<div style="display:flex;gap:16px;flex-wrap:wrap;align-items:flex-end;margin-bottom:8px"><b>Loan structures</b>' + inp('Loan-to-value %', 'ltv', lt) + inp('Interest rate %', 'rate', B.rate) + '</div><div style="overflow-x:auto"><table style="' + T + ';min-width:520px"><thead><tr>' + th('Structure', true) + th('Loan') + th('Equity') + th('DSCR') + th('Cash-on-cash') + th('IRR') + th('Multiple') + '</tr></thead><tbody>' + srows + '</tbody></table></div>'
    + '<div style="margin-top:10px;font-size:13px">' + (be ? 'At <b>' + P(lt, 0) + '</b> loan-to-value, debt adds to the return as long as the rate stays below about <b>' + P(be, 2) + '</b>; above that it costs more than the property earns on the borrowed money.' : 'Across 4% to 10%, debt at ' + P(lt, 0) + ' loan-to-value ' + (ref && ref.irr > L.u.irr ? 'always adds to the return.' : 'never adds to the return at this price.')) + (ref ? ' At ' + P(B.rate, 2) + ' it returns <b>' + P(ref.irr, 1) + '</b> against <b>' + P(L.u.irr, 1) + '</b> unlevered.' : '') + '</div>');
  hdr.main = main; hdr.meta = { Property:s.name, Price:M(B.noi / B.cap), 'Unlevered IRR':P(L.u.irr, 1) }; return hdr;
}
var g = function(){ if(!active() && typeof window.bkEmptyState === 'function') return window.bkEmptyState('Financing Lab'); return render(); };
if(typeof window.bkRegisterRenderer === 'function') window.bkRegisterRenderer('Financing Lab', g); else RENDERERS['Financing Lab'] = g;
})();
