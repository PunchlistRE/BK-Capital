
/* V29.26.0 - PRO FORMA AND RETURNS, designed. A reading of the deal before the tables: what the income and cash flow look like, where the return comes from, how it holds up by case.
   Everything is drawn from the live engine (annual operating statement, monthly equity cash flow, the debt schedule, the scenario cases); the tables underneath are unchanged.
   Print / Save as PDF produces a clean one-document pro forma. Acquisition deals. */
(function(){
'use strict';
if(typeof RENDERERS === 'undefined' || typeof window.bkInCase !== 'function') return;
function esc(v){ return String(v == null ? '' : v).replace(/[&<>"]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
function safe(f, d){ try { var v = f(); return v === undefined ? d : v; } catch(e){ return d; } }
function M(v, d){ if(v == null || !isFinite(v)) return '—'; var a = Math.abs(v); var t = a >= 1e6 && d !== 0 ? '$' + (a / 1e6).toFixed(2) + 'M' : '$' + Math.round(a).toLocaleString('en-US'); return v < 0 ? '(' + t + ')' : t; }
function F(v){ if(v == null || !isFinite(v)) return '—'; var a = Math.abs(v), t = '$' + Math.round(a).toLocaleString('en-US'); return v < 0 ? '(' + t + ')' : (Math.round(v) === 0 ? '–' : t); }
function P(v, d){ return (v == null || !isFinite(v)) ? '—' : (v * 100).toFixed(d == null ? 1 : d) + '%'; }
function X(v){ return (v == null || !isFinite(v)) ? '—' : v.toFixed(2) + 'x'; }
function sum(a){ return a.reduce(function(t, v){ return t + (Number(v) || 0); }, 0); }
var COL = { navy:'#163a62', gold:'#E3A72F', up:'var(--sx-up,#2E6EB8)', dn:'var(--sx-dn,#C0392B)', ok:'#2E8B57', ink:'currentColor', grid:'rgba(120,120,120,.22)' };

/* ------------------------------------------------------------------ the numbers */
function build(){
  return window.bkInCase(function(s){
    var u = bkAnnualCF(), m = bkMonthlyReturns(), d = bkDebt(), pol = safe(function(){ return bkPolicy(); }, {}), H = u.arr.length, units = Number(s.units) || 0, Y = [];
    for(var k = 0; k < H; k++){ var a = u.arr[k], L = a.lines || {}, rows = m.rows.filter(function(r){ return r.y === k + 1; });
      var ds = sum(rows.map(function(r){ return r.ds; })), fee = sum(rows.map(function(r){ return r.assetFee; })), noi = a.noi, res = -(L.reserves || 0) || sum(rows.map(function(r){ return r.reserve; })), eqin = sum(rows.map(function(r){ return r.eqDraw; }));
      var cf = sum(rows.map(function(r){ return r.cf; })), op = noi - res - ds - fee, events = cf - op + eqin;
      Y.push({ y:k + 1, gpr:(L.gprGross || 0) + (L.commGross || 0), vac:(L.resVac || 0) + (L.commVac || 0) - (L.commFree || 0) - (L.commCredit || 0), bad:(L.bad || 0) + (L.commCredit || 0), ltl:(L.ltl || 0) + (L.concess || 0) + (L.commFree || 0), other:L.other || 0, egi:a.egi,
        taxes:L.taxes || 0, ins:L.insurance || 0, ctrl:L.ctrlOpex || 0, mgmt:L.mgmt || 0, opex:-a.expenses, noi:noi, res:-res, noiAfter:a.after, ds:-ds, fee:-fee, cfads:op, dscr:ds ? a.after / ds : null, eqin:eqin, cf:cf, events:events, coc:null });
    }
    var eq = Number(d.equity) || sum(Y.map(function(r){ return r.eqin; }));
    Y.forEach(function(r){ r.coc = eq ? r.cfads / eq : null; });
    var cum = 0; Y.forEach(function(r){ cum += r.cf; r.cum = cum; });
    var tot = { eqin:sum(Y.map(function(r){ return r.eqin; })), op:sum(Y.map(function(r){ return r.cfads; })), events:sum(Y.map(function(r){ return r.events; })), profit:sum(Y.map(function(r){ return r.cf; })) };
    return { s:s, Y:Y, H:H, units:units, eq:eq, m:m, d:d, u:u, pol:pol, tot:tot, irr:m.irr, moic:m.moic, price:Number(s.purchasePrice) || 0 };
  });
}

/* ------------------------------------------------------------------ charts (inline SVG, responsive) */
function svgOpen(w, h, label){ return '<svg viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="' + esc(label) + '" style="width:100%;height:auto;display:block;overflow:visible">'; }
function niceMax(v){ if(!(v > 0)) return 1; var p = Math.pow(10, Math.floor(Math.log10(v))), n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p; }
function axisLbl(v){ var a = Math.abs(v); var t = a >= 1e6 ? (a / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'M' : a >= 1e3 ? Math.round(a / 1e3) + 'K' : String(Math.round(a)); return (v < 0 ? '-' : '') + '$' + t; }
/* NOI after reserves (bars) against debt service (line), with the coverage ratio under each year */
function chartCoverage(D){
  var W = 760, Hh = 250, L = 52, R = 14, T = 16, B = 46, n = D.Y.length, mx = niceMax(Math.max.apply(null, D.Y.map(function(r){ return Math.max(r.noiAfter, -r.ds); })) * 1.08), bw = (W - L - R) / n, bh = Hh - T - B, g = '';
  var Yp = function(v){ return T + bh - v / mx * bh; };
  for(var t = 0; t <= 4; t++){ var v = mx * t / 4, y = Yp(v); g += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y + '" y2="' + y + '" stroke="' + COL.grid + '"/><text x="' + (L - 8) + '" y="' + (y + 4) + '" text-anchor="end" font-size="11" fill="currentColor" opacity=".65">' + axisLbl(v) + '</text>'; }
  var pts = [];
  D.Y.forEach(function(r, i){ var x = L + i * bw, w = bw * 0.46, bx = x + (bw - w) / 2, top = Yp(r.noiAfter), ok = r.dscr == null || r.dscr >= (D.pol.minDSCR || 1.25);
    g += '<rect x="' + bx + '" y="' + top + '" width="' + w + '" height="' + (T + bh - top) + '" rx="3" fill="' + COL.navy + '" opacity=".92"><title>Year ' + r.y + ': NOI after reserves ' + M(r.noiAfter) + '</title></rect>';
    g += '<text x="' + (bx + w / 2) + '" y="' + (top - 6) + '" text-anchor="middle" font-size="11" font-weight="600" fill="currentColor">' + axisLbl(r.noiAfter) + '</text>';
    g += '<text x="' + (bx + w / 2) + '" y="' + (Hh - 26) + '" text-anchor="middle" font-size="11" fill="currentColor" opacity=".75">Year ' + r.y + '</text>';
    g += '<text x="' + (bx + w / 2) + '" y="' + (Hh - 9) + '" text-anchor="middle" font-size="11.5" font-weight="700" fill="' + (ok ? COL.ok : COL.dn) + '">' + X(r.dscr) + '</text>'; pts.push([bx + w / 2, Yp(-r.ds)]); });
  if(pts.length > 1) g += '<polyline points="' + pts.map(function(p){ return p[0] + ',' + p[1]; }).join(' ') + '" fill="none" stroke="' + COL.gold + '" stroke-width="2.5"/>';
  pts.forEach(function(p){ g += '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="4.5" fill="' + COL.gold + '" stroke="#fff" stroke-width="1.5"/>'; });
  return svgOpen(W, Hh, 'NOI after reserves against debt service by year') + g + '</svg>';
}
/* equity cash flow by year (negative at close, then distributions and sale) with the running total */
function chartCash(D){
  var W = 760, Hh = 270, L = 58, R = 14, T = 22, B = 30, n = D.Y.length, vals = D.Y.map(function(r){ return r.cf; }).concat(D.Y.map(function(r){ return r.cum; }));
  var mx = niceMax(Math.max.apply(null, vals.concat([1]))), mn = -niceMax(Math.max.apply(null, vals.map(function(v){ return Math.max(0, -v); }).concat([0])) || 1); if(Math.min.apply(null, vals) >= 0) mn = 0;
  var bw = (W - L - R) / n, bh = Hh - T - B, Yp = function(v){ return T + (mx - v) / (mx - mn) * bh; }, g = '';
  for(var t = 0; t <= 4; t++){ var v = mn + (mx - mn) * t / 4, y = Yp(v); g += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y + '" y2="' + y + '" stroke="' + COL.grid + '"/><text x="' + (L - 8) + '" y="' + (y + 4) + '" text-anchor="end" font-size="11" fill="currentColor" opacity=".65">' + axisLbl(v) + '</text>'; }
  g += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + Yp(0) + '" y2="' + Yp(0) + '" stroke="currentColor" opacity=".5"/>';
  var pts = [];
  D.Y.forEach(function(r, i){ var x = L + i * bw, w = bw * 0.5, bx = x + (bw - w) / 2, y0 = Yp(0), y1 = Yp(r.cf), top = Math.min(y0, y1), hh = Math.abs(y1 - y0);
    g += '<rect x="' + bx + '" y="' + top + '" width="' + w + '" height="' + Math.max(1, hh) + '" rx="3" fill="' + (r.cf < 0 ? COL.dn : COL.up) + '" opacity=".9"><title>Year ' + r.y + ': ' + M(r.cf) + '</title></rect>';
    g += '<text x="' + (bx + w / 2) + '" y="' + (r.cf < 0 ? top + hh + 14 : top - 6) + '" text-anchor="middle" font-size="11" font-weight="600" fill="currentColor">' + axisLbl(r.cf) + '</text>';
    g += '<text x="' + (bx + w / 2) + '" y="' + (Hh - 8) + '" text-anchor="middle" font-size="11" fill="currentColor" opacity=".75">Year ' + r.y + '</text>'; pts.push([bx + w / 2, Yp(r.cum)]); });
  g += '<polyline points="' + pts.map(function(p){ return p[0] + ',' + p[1]; }).join(' ') + '" fill="none" stroke="' + COL.gold + '" stroke-width="2.5"/>';
  pts.forEach(function(p){ g += '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="4" fill="' + COL.gold + '" stroke="#fff" stroke-width="1.5"/>'; });
  var pb = null; for(var k = 0; k < D.Y.length; k++){ if(D.Y[k].cum >= 0){ pb = k; break; } }
  if(pb != null) g += '<text x="' + pts[pb][0] + '" y="' + (pts[pb][1] - 10) + '" text-anchor="middle" font-size="10.5" font-weight="700" fill="' + COL.ok + '">money back</text>';
  return svgOpen(W, Hh, 'Equity cash flow by year with running total') + g + '</svg>';
}
/* where the profit comes from: equity in, operating cash flow, the sale (net of the loan), profit */
function chartBridge(D){
  var steps = [['Equity invested', -D.tot.eqin, 'dn'], ['Operating cash flow', D.tot.op, 'up'], ['Sale and refinance, after debt', D.tot.events, 'up']], W = 760, Hh = 250, L = 20, R = 20, T = 26, B = 52, n = steps.length + 1, run = 0, bars = [];
  steps.forEach(function(s_){ var from = run; run += s_[1]; bars.push({ l:s_[0], a:from, b:run, v:s_[1], k:s_[1] < 0 ? 'dn' : 'up' }); });
  bars.push({ l:'Equity profit', a:0, b:run, v:run, k:run >= 0 ? 'ok' : 'dn', total:true });
  var hi = Math.max.apply(null, bars.map(function(b){ return Math.max(b.a, b.b, 0); })), lo = Math.min.apply(null, bars.map(function(b){ return Math.min(b.a, b.b, 0); })), mx = niceMax(hi * 1.1), mn = lo < 0 ? -niceMax(-lo * 1.1) : 0;
  var bh = Hh - T - B, Yp = function(v){ return T + (mx - v) / (mx - mn) * bh; }, bw = (W - L - R) / n, g = '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + Yp(0) + '" y2="' + Yp(0) + '" stroke="currentColor" opacity=".5"/>';
  bars.forEach(function(b, i){ var x = L + i * bw, w = bw * 0.56, bx = x + (bw - w) / 2, y0 = Yp(b.a), y1 = Yp(b.b), top = Math.min(y0, y1), hh = Math.max(2, Math.abs(y1 - y0)), col = b.k === 'dn' ? COL.dn : b.k === 'ok' ? COL.ok : COL.up;
    g += '<rect x="' + bx + '" y="' + top + '" width="' + w + '" height="' + hh + '" rx="3" fill="' + col + '" opacity="' + (b.total ? 1 : .88) + '"/>';
    g += '<text x="' + (bx + w / 2) + '" y="' + (top - 7) + '" text-anchor="middle" font-size="12" font-weight="700" fill="currentColor">' + M(b.v) + '</text>';
    var words = b.l.split(' '), half = Math.ceil(words.length / 2); g += '<text x="' + (bx + w / 2) + '" y="' + (Hh - 30) + '" text-anchor="middle" font-size="11" fill="currentColor" opacity=".8">' + esc(words.slice(0, half).join(' ')) + '</text><text x="' + (bx + w / 2) + '" y="' + (Hh - 16) + '" text-anchor="middle" font-size="11" fill="currentColor" opacity=".8">' + esc(words.slice(half).join(' ')) + '</text>';
    if(i < bars.length - 1) g += '<line x1="' + (bx + w) + '" x2="' + (L + (i + 1) * bw + (bw - w) / 2) + '" y1="' + Yp(b.b) + '" y2="' + Yp(b.b) + '" stroke="currentColor" opacity=".35" stroke-dasharray="3 3"/>'; });
  return svgOpen(W, Hh, 'Equity profit bridge') + g + '</svg>';
}
/* Year 1: where each dollar of effective gross income goes */
function chartDollar(D){
  var y = D.Y[0], egi = y.egi || 1, parts = [['Taxes', -y.taxes, '#7A8FA6'], ['Insurance', -y.ins, '#98AABD'], ['Operating costs', -y.ctrl, '#B5C2D0'], ['Management', -y.mgmt, '#D0D9E2'], ['Reserves', y.res * -1, '#E6D9B8'], ['Net cash after reserves', y.noiAfter, COL.navy]], W = 760, Hh = 108, x = 0, g = '';
  parts.forEach(function(p){ var w = Math.max(0, p[1]) / egi * W; if(w <= 0) return; g += '<rect x="' + x + '" y="24" width="' + w + '" height="38" fill="' + p[2] + '"><title>' + p[0] + ' ' + M(p[1]) + ' (' + P(p[1] / egi) + ' of EGI)</title></rect>';
    if(w > 46) g += '<text x="' + (x + w / 2) + '" y="48" text-anchor="middle" font-size="11.5" font-weight="700" fill="' + (p[2] === COL.navy ? '#fff' : '#0e2a4a') + '">' + P(p[1] / egi, 0) + '</text>'; x += w; });
  x = 0; parts.forEach(function(p, i){ var w = Math.max(0, p[1]) / egi * W; if(w <= 0) return; g += '<text x="' + (x + w / 2) + '" y="' + (i % 2 ? 92 : 80) + '" text-anchor="middle" font-size="10.5" fill="currentColor" opacity=".8">' + esc(p[0]) + '</text>'; x += w; });
  g += '<text x="0" y="14" font-size="11" fill="currentColor" opacity=".7">Each $1 of Year-1 effective gross income (' + M(y.egi) + ')</text>';
  return svgOpen(W, Hh, 'Where each dollar of income goes, Year 1') + g + '</svg>';
}
function gauge(D){
  var h = Number(D.pol.targetIRR) || 0.12, irr = D.irr, mx = Math.max(0.3, h * 1.6, (isFinite(irr) ? irr : 0) * 1.2), W = 760, Hh = 66, X_ = function(v){ return Math.max(0, Math.min(1, v / mx)) * (W - 8) + 4; }, ok = isFinite(irr) && irr >= h;
  return svgOpen(W, Hh, 'Levered IRR against the hurdle') + '<rect x="4" y="26" width="' + (W - 8) + '" height="14" rx="7" fill="rgba(120,120,120,.18)"/><rect x="4" y="26" width="' + Math.max(0, X_(isFinite(irr) ? Math.max(irr, 0) : 0) - 4) + '" height="14" rx="7" fill="' + (ok ? COL.ok : COL.dn) + '"/>'
    + '<line x1="' + X_(h) + '" x2="' + X_(h) + '" y1="18" y2="48" stroke="currentColor" stroke-width="2"/><text x="' + X_(h) + '" y="13" text-anchor="middle" font-size="11" font-weight="700" fill="currentColor">hurdle ' + P(h, 1) + '</text>'
    + '<text x="' + Math.min(W - 40, Math.max(40, X_(isFinite(irr) ? Math.max(irr, 0) : 0))) + '" y="62" text-anchor="middle" font-size="12" font-weight="700" fill="' + (ok ? COL.ok : COL.dn) + '">levered IRR ' + P(irr, 1) + '</text></svg>';
}

/* ------------------------------------------------------------------ blocks */
var CSS = '.pf{max-width:1040px}.pf h3{font:700 11px/1 Inter,system-ui,sans-serif;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-500,#566a80);margin:22px 0 8px}.pf-card{background:var(--surface,#fff);border:1px solid var(--line,#dbe4ec);border-radius:12px;padding:16px 18px;margin-top:10px}'
 + '.pf-cols{display:grid;grid-template-columns:1fr;gap:14px}.pf-card svg{width:100%;height:auto;display:block}.pf-wrap{overflow-x:auto;max-width:100%}.pf-card .t{font:700 13px Inter,system-ui,sans-serif;margin:0 0 2px}.pf-card .s{font-size:12px;color:var(--ink-500,#566a80);margin:0 0 10px;line-height:1.45}'
 + '.pf-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin:8px 0}.pf-kpi{background:var(--surface,#fff);border:1px solid var(--line,#dbe4ec);border-radius:10px;padding:11px 13px}.pf-kpi .k{font-size:10px;letter-spacing:.09em;text-transform:uppercase;color:var(--ink-500,#566a80);font-weight:700}.pf-kpi .v{font:700 21px/1.25 "Schibsted Grotesk","Inter","Segoe UI Variable Text","Segoe UI",system-ui,-apple-system,"Helvetica Neue",Arial,sans-serif;margin-top:3px}.pf-kpi .d{font-size:11px;color:var(--ink-500,#566a80)}'
 + '.pf-ins{margin:10px 0 0;padding:0;list-style:none;display:grid;gap:6px}.pf-ins li{font-size:13px;line-height:1.5;padding:9px 12px;border-left:3px solid #3E9AE6;background:rgba(62,154,230,.09);border-radius:0 8px 8px 0}'
 + '.pf-scen{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}@media (max-width:640px){.pf-scen{grid-template-columns:1fr}}.pf-sc{border:1px solid var(--line,#dbe4ec);border-radius:10px;padding:12px 14px;background:var(--surface,#fff)}.pf-sc.cur{border-color:#3E9AE6;box-shadow:0 0 0 1px #3E9AE6 inset}.pf-sc .n{font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;font-weight:700;color:var(--ink-500,#566a80)}.pf-sc .v{font:700 24px/1.2 "Schibsted Grotesk","Inter","Segoe UI Variable Text","Segoe UI",system-ui,-apple-system,"Helvetica Neue",Arial,sans-serif;margin:4px 0}.pf-sc .d{font-size:12px;color:var(--ink-500,#566a80)}'
 + '.pf-tbl{width:100%;border-collapse:collapse;font-size:12px;font-variant-numeric:tabular-nums}.pf-tbl th{background:#0e2a4a;color:#fff;font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;padding:8px 7px;text-align:right;white-space:nowrap}.pf-tbl th:first-child,.pf-tbl td:first-child{text-align:left;position:sticky;left:0;z-index:1}'
 + '.pf-tbl td{padding:6px 7px;text-align:right;border-top:1px solid var(--line,#dbe4ec);background:var(--surface,#fff);white-space:nowrap}.pf-tbl td.l{text-align:left;padding-left:16px}.pf-tbl tr.sec td{background:#e8f1fa;font-weight:700;font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:#566a80}.pf-tbl tr.sub td{font-weight:700;background:#EEF2F6}.pf-tbl tr.tot td{font-weight:700;background:#0e2a4a;color:#fff}.pf-tbl tr.tot td:first-child{background:#0e2a4a}.pf-tbl td.dim{color:var(--ink-500,#566a80)}.pf-tbl tr:not(.sec):not(.tot):hover td{background:rgba(62,154,230,.14)}.pf-tbl .neg{color:#B23A2C}.pf-tbl tr.tot .neg{color:#FFB3A8}'
 + '.pf-bar{display:flex;gap:8px;justify-content:flex-end;margin:0 0 4px}.pf-print{background:var(--surface,#fff);border:1px solid #3E9AE6;color:var(--ink-900,#0e2a4a);border-radius:999px;padding:8px 14px;font:700 11px/1 Inter,system-ui,sans-serif;letter-spacing:.06em;text-transform:uppercase;cursor:pointer}'
 + '.pf-note{font-size:11.5px;color:var(--ink-500,#566a80);margin-top:8px;line-height:1.45}'
 + '@media print{body{background:#fff !important}.rail,.brand-bar,.tabnav,.bk-flow,.side-col,.bk-stepnav,.pf-bar,.title-block .btn,#pl-palette,#pl-modal,#pl-tip,.bk-case,.colour-key{display:none !important}.shell{display:block !important}.sheet-viewport,#viewport{overflow:visible !important;height:auto !important}.body-grid{display:block !important}.main-col{padding:0 !important;max-width:none !important}.pf-card,.pf-kpi,.pf-sc,.tbl-wrap{break-inside:avoid;box-shadow:none !important}.pf-tbl th:first-child,.pf-tbl td:first-child{position:static}.pf-tbl th,.pf-tbl tr.tot td{-webkit-print-color-adjust:exact;print-color-adjust:exact}svg{-webkit-print-color-adjust:exact;print-color-adjust:exact}@page{margin:14mm}}';
if(!document.getElementById('pf-css')){ var st = document.createElement('style'); st.id = 'pf-css'; st.textContent = CSS; document.head.appendChild(st); }
window.bkPrintProForma = function(){ window.print(); };
function printBar(){ return '<div class="pf-bar"><button type="button" class="pf-print" onclick="bkPrintProForma()">Print / save as PDF</button></div>'; }
function card(title, sub, body){ return '<div class="pf-card"><p class="t">' + title + '</p>' + (sub ? '<p class="s">' + sub + '</p>' : '') + body + '</div>'; }
function cagr(a, b, n){ return a > 0 && b > 0 && n > 0 ? Math.pow(b / a, 1 / n) - 1 : null; }
function kpi(k, v, d){ return '<div class="pf-kpi"><div class="k">' + k + '</div><div class="v">' + v + '</div><div class="d">' + d + '</div></div>'; }

/* the statement: one line per row, a column per year, then $/unit and % of EGI for Year 1 and the growth rate */
function statement(D){
  var Y = D.Y, n = Y.length, u = D.units || 1, egi1 = Y[0].egi || 1, head = '<th>Line item</th>' + Y.map(function(r){ return '<th>Year ' + r.y + '</th>'; }).join('') + '<th>$ / unit (Y1)</th><th>% of EGI (Y1)</th><th>Growth / yr</th>';
  function row(label, key, cls, opts){ opts = opts || {}; var vals = Y.map(function(r){ return typeof key === 'function' ? key(r) : r[key]; }), v1 = vals[0], vn = vals[n - 1], g = cagr(Math.abs(v1), Math.abs(vn), n - 1);
    var cell = function(v){ return '<td class="' + (v < 0 && !opts.plain ? 'neg' : '') + '">' + (opts.fmt ? opts.fmt(v) : F(v)) + '</td>'; };
    return '<tr class="' + (cls || '') + '"><td class="' + (cls ? '' : 'l') + '">' + label + '</td>' + vals.map(cell).join('') + '<td class="dim">' + (opts.noUnit ? '' : F(v1 / u)) + '</td><td class="dim">' + (opts.noPct ? '' : P(v1 / egi1)) + '</td><td class="dim">' + (opts.noG || g == null ? '' : P(g)) + '</td></tr>'; }
  var sec = function(t){ return '<tr class="sec"><td colspan="' + (n + 4) + '">' + t + '</td></tr>'; };
  var html = '<div class="tbl-wrap" style="overflow-x:auto"><table class="pf-tbl"><thead><tr>' + head + '</tr></thead><tbody>'
    + sec('Revenue') + row('Gross potential rent', 'gpr') + row('Vacancy', 'vac') + row('Bad debt and credit loss', 'bad') + (Y.some(function(r){ return r.ltl; }) ? row('Loss to lease and concessions', 'ltl') : '') + row('Other income', 'other')
    + row('Effective gross income', 'egi', 'sub')
    + sec('Operating expenses') + row('Real estate taxes', 'taxes') + row('Insurance', 'ins') + row('Operating costs (repairs, payroll, utilities, other)', 'ctrl') + row('Management fee', 'mgmt') + row('Total operating expenses', 'opex', 'sub')
    + row('Net operating income', 'noi', 'tot') + row('Replacement reserves', 'res') + row('NOI after reserves', 'noiAfter', 'sub')
    + sec('Debt and cash flow') + row('Debt service', 'ds') + row('Asset management fee', 'fee') + row('Cash flow after debt service', 'cfads', 'tot')
    + row('Debt service coverage (NOI after reserves)', 'dscr', '', { fmt:X, noUnit:true, noPct:true, noG:true, plain:true }) + row('Cash-on-cash return', 'coc', '', { fmt:function(v){ return P(v); }, noUnit:true, noPct:true, noG:true, plain:true })
    + '</tbody></table></div>';
  return html;
}

/* ------------------------------------------------------------------ the three sheets */
function proFormaBlock(D){
  var Y = D.Y, n = Y.length, y1 = Y[0], yn = Y[n - 1], g = cagr(y1.noi, yn.noi, n - 1), minD = Math.min.apply(null, Y.map(function(r){ return r.dscr == null ? 99 : r.dscr; })), avgCoc = sum(Y.map(function(r){ return r.coc || 0; })) / n;
  var ins = [];
  ins.push('NOI grows <b>' + P(g) + ' a year</b> (' + M(y1.noi) + ' to ' + M(yn.noi) + ') while debt service ' + (Math.abs(yn.ds - y1.ds) < 1 ? 'is flat at ' + M(-y1.ds) : 'moves from ' + M(-y1.ds) + ' to ' + M(-yn.ds)) + ', so coverage goes from <b>' + X(y1.dscr) + '</b> to <b>' + X(yn.dscr) + '</b>.');
  var pm = D.pol.minDSCR || 1.25; if(minD < pm) ins.push('Coverage is below the <b>' + X(pm) + '</b> policy minimum in ' + Y.filter(function(r){ return r.dscr != null && r.dscr < pm; }).map(function(r){ return 'Year ' + r.y; }).join(', ') + ': this is what the credit gate is reacting to.');
  var er = -y1.opex / y1.egi; ins.push('Year 1 expenses take <b>' + P(er, 0) + '</b> of income (' + M(-y1.opex / D.units, 0) + ' per unit); taxes alone are ' + P(-y1.taxes / y1.egi, 0) + '.');
  return '<div class="pf">' + printBar()
    + '<div class="pf-kpis">' + kpi('Year-1 NOI', M(y1.noi), P(y1.noi / y1.egi, 0) + ' of income') + kpi('NOI growth', P(g), 'per year, Year 1 to ' + n) + kpi('Year-1 cash-on-cash', P(y1.coc), 'after debt service') + kpi('Lowest coverage', X(minD), 'policy minimum ' + X(pm)) + kpi('Going-in yield', D.price ? P(y1.noiAfter / D.price) : '—', 'NOI after reserves / price') + '</div>'
    + '<ul class="pf-ins">' + ins.map(function(t){ return '<li>' + t + '</li>'; }).join('') + '</ul>'
    + '<div class="pf-cols">' + card('Income against debt service', 'Bars are NOI after reserves; the line is debt service. The figure under each year is coverage.', chartCoverage(D)) + card('Where each dollar of income goes', 'Year 1.', chartDollar(D)) + '</div>'
    + '<h3>Pro forma</h3>' + card('Annual statement', 'Per-unit and share-of-income columns are Year 1. Growth is the compound annual rate from Year 1 to Year ' + n + '.', statement(D)) + '<p class="pf-note">Detail below is the engine’s own operating statement; it ties to the figures above.</p></div>';
}
function returnsBlock(D, scen){
  var T = D.tot, ins = [], pr = T.profit, shSale = pr > 0 ? T.events / (T.op + T.events) : null;
  if(pr > 0 && T.op + T.events > 0) ins.push('Of the <b>' + M(T.op + T.events) + '</b> the equity gets back, <b>' + P(T.op / (T.op + T.events), 0) + '</b> comes from running the property and <b>' + P(T.events / (T.op + T.events), 0) + '</b> from the sale and refinance, after repaying the loan.');
  ins.push('Equity of <b>' + M(T.eqin) + '</b> returns <b>' + M(T.op + T.events) + '</b> over ' + D.H + ' years: a <b>' + X(D.moic) + '</b> multiple and <b>' + P(D.irr) + '</b> levered IRR' + (isFinite(D.irr) && D.pol.targetIRR ? ', ' + (D.irr >= D.pol.targetIRR ? 'above' : '<b>' + ((D.pol.targetIRR - D.irr) * 100).toFixed(1) + ' points below</b>') + ' the ' + P(D.pol.targetIRR, 1) + ' hurdle.' : '.'));
  var pb = D.Y.filter(function(r){ return r.cum >= 0; })[0]; ins.push(pb ? 'Cumulative cash turns positive in <b>Year ' + pb.y + '</b>.' : 'Cumulative cash never turns positive within the hold.');
  var sc = scen ? '<h3>How it holds up by case</h3><div class="pf-scen">' + scen.cases.map(function(c){ return '<div class="pf-sc' + (String(D.s.scenarioCase || 'Base') === c.name ? ' cur' : '') + '"><div class="n">' + c.name + (c.p != null ? ' · ' + P(c.p, 0) + ' likely' : '') + '</div><div class="v">' + P(c.irr) + '</div><div class="d">' + X(c.moic) + ' multiple · ' + M(c.profit) + ' profit</div></div>'; }).join('') + '</div>' : '';
  return '<div class="pf">' + printBar() + '<div class="pf-card" style="margin-top:0"><p class="t">Levered return against the hurdle</p>' + gauge(D) + '</div>'
    + '<ul class="pf-ins">' + ins.map(function(t){ return '<li>' + t + '</li>'; }).join('') + '</ul>'
    + '<div class="pf-cols">' + card('Equity cash flow', 'Each year’s cash to equity; the line is the running total. Year 1 includes the equity put in at close.', chartCash(D)) + card('Where the profit comes from', 'Equity in, operating cash flow, then the sale net of the loan.', chartBridge(D)) + '</div>' + sc
    + '<h3>Detail</h3></div>';
}
function dollarBlock(D){ return '<div class="pf">' + printBar() + card('Where each dollar of income goes', 'Year 1 effective gross income, split into what it pays for and what is left.', chartDollar(D)) + '</div>'; }

function wrap(name, blockFn, needScen){
  var prev = RENDERERS[name]; if(typeof prev !== 'function') return;
  RENDERERS[name] = function(){
    var o = prev.apply(this, arguments); if(!o || typeof o.main !== 'string') return o;
    var s = safe(function(){ return bkLoad(); }, null); if(!s || /develop/i.test(String(s.dealType || '')) || !(typeof window.bkHasActiveDeal !== 'function' || window.bkHasActiveDeal())) return o;
    var D = safe(build, null); if(!D || !D.Y || !D.Y.length) return o;
    var scen = needScen ? safe(function(){ return bkRiskScenarios(); }, null) : null;
    return Object.assign({}, o, { main: safe(function(){ return blockFn(D, scen); }, '') + o.main });
  };
  if(typeof window.bkRegisterRenderer === 'function') try { window.bkRegisterRenderer(name, RENDERERS[name]); } catch(e){}
}
wrap('Property CF', proFormaBlock, false);
wrap('Returns', returnsBlock, true);
wrap('Operating Underwrite', dollarBlock, false);
window.bkProFormaData = function(){ return safe(build, null); };
window.bkProFormaKit = { build:build, chartCoverage:chartCoverage, chartCash:chartCash, chartBridge:chartBridge, chartDollar:chartDollar, gauge:gauge, M:M, F:F, P:P, X:X, esc:esc, sum:sum, COL:COL };
})();
