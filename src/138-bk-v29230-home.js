
/* V29.23.0 - HOME. The front door and the deal dashboard: what this deal is, how it looks against policy, what to do next. Presentation only: every figure comes from the
   live engine, gate and checks already in the app. The earlier certification and module tables are kept, under "Certification and module detail". */
(function(){
'use strict';
if(typeof RENDERERS === 'undefined' || typeof RENDERERS['Home'] !== 'function') return;
var prev = RENDERERS['Home'];
function esc(v){ return String(v == null ? '' : v).replace(/[&<>"]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
function P(v, d){ return (v == null || !isFinite(v)) ? '—' : (v * 100).toFixed(d == null ? 1 : d) + '%'; }
function X(v){ return (v == null || !isFinite(v)) ? '—' : v.toFixed(2) + 'x'; }
function M(v){ if(v == null || !isFinite(v)) return '—'; var a = Math.abs(v), t = a >= 1e6 ? '$' + (a / 1e6).toFixed(2) + 'M' : '$' + Math.round(a).toLocaleString('en-US'); return v < 0 ? '(' + t + ')' : t; }
function isDev(s){ return /develop|redevelop/i.test(String((s || {}).dealType || '')); }
function safe(f, d){ try { var v = f(); return v === undefined ? d : v; } catch(e){ return d; } }
var CSS = '.pl-home{max-width:1040px}.pl-hero{margin:4px 0 18px}.pl-hero h2{font:700 30px/1.15 "Schibsted Grotesk","Inter","Segoe UI Variable Text","Segoe UI",system-ui,-apple-system,"Helvetica Neue",Arial,sans-serif;margin:0 0 6px;color:var(--ink-900,#10233a)}'
 + '.pl-sub{color:var(--ink-500,#566a80);font-size:13.5px;line-height:1.5;margin:0}.pl-chips{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;align-items:center}'
 + '.pl-kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:16px 0}@media (max-width:560px){.pl-kpis{grid-template-columns:repeat(2,1fr)}}.title-block:has(h2:empty){display:none}.pl-kpi{background:var(--surface,#fff);border:1px solid var(--line,#dbe4ec);border-radius:10px;padding:14px 14px 12px;cursor:pointer;text-align:left;font:inherit;color:inherit;transition:box-shadow .15s,border-color .15s}'
 + '.pl-kpi:hover{box-shadow:0 4px 14px rgba(16,25,34,.10);border-color:#3E9AE6}.pl-kpi .k{font-size:10.5px;letter-spacing:.09em;text-transform:uppercase;color:var(--ink-500,#566a80);font-weight:700}.pl-kpi .v{font:700 26px/1.2 "Schibsted Grotesk","Inter","Segoe UI Variable Text","Segoe UI",system-ui,-apple-system,"Helvetica Neue",Arial,sans-serif;margin:6px 0 2px}.pl-kpi .s{font-size:11.5px;color:var(--ink-500,#566a80)}'
 + '.pl-kpi.pass .v{color:#2E6E4A}.pl-kpi.warn .v{color:#A66A12}.pl-kpi.fail .v{color:#B23A2C}'
 + '.pl-next{display:flex;gap:16px;align-items:center;justify-content:space-between;flex-wrap:wrap;background:linear-gradient(135deg,#0e2a4a,#163a62);color:#fff;border-radius:12px;padding:18px 20px;margin:6px 0 18px;border-left:5px solid #3E9AE6}'
 + '.pl-next .t{font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;color:#3E9AE6;font-weight:700}.pl-next .m{font:600 18px/1.35 "Schibsted Grotesk","Inter","Segoe UI Variable Text","Segoe UI",system-ui,-apple-system,"Helvetica Neue",Arial,sans-serif;margin:4px 0 2px}.pl-next .d{font-size:12.5px;color:#C7D2DD;max-width:620px}'
 + '.pl-btn{background:#3E9AE6;color:#0e2a4a;border:0;border-radius:999px;padding:10px 18px;font:700 12px/1 Inter,system-ui,sans-serif;letter-spacing:.06em;text-transform:uppercase;cursor:pointer;white-space:nowrap}.pl-btn:hover{background:#D8BB7C}.pl-btn.ghost{background:transparent;color:inherit;border:1px solid currentColor}'
 + '.pl-h{font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-500,#566a80);font-weight:700;margin:22px 0 8px}'
 + '.pl-check{background:var(--surface,#fff);border:1px solid var(--line,#dbe4ec);border-radius:10px;overflow:hidden}.pl-row{display:grid;grid-template-columns:22px minmax(130px,1fr) minmax(0,2fr) auto;gap:12px;align-items:center;padding:11px 14px;border-top:1px solid var(--line,#dbe4ec);cursor:pointer;font-size:13px}'
 + '.pl-row:first-child{border-top:0}.pl-row:hover{background:rgba(62,154,230,.10)}.pl-row .dot{width:10px;height:10px;border-radius:50%;background:#7a8da1}.pl-row.pass .dot{background:#2E8B57}.pl-row.warn .dot{background:#D9A441}.pl-row.fail .dot{background:#C0392B}.pl-row .l{font-weight:600}.pl-row .r{color:var(--ink-500,#566a80)}.pl-row .go{color:#1E5FA8;font-size:12px;white-space:nowrap}'
 + '.pl-acts{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px}.pl-act{background:var(--surface,#fff);border:1px solid var(--line,#dbe4ec);border-radius:10px;padding:14px;cursor:pointer;text-align:left;font:inherit;color:inherit;transition:box-shadow .15s,border-color .15s}'
 + '.pl-act:hover{box-shadow:0 4px 14px rgba(16,25,34,.10);border-color:#3E9AE6}.pl-act b{display:block;font-size:14px;margin-bottom:3px}.pl-act span{font-size:12px;color:var(--ink-500,#566a80);line-height:1.4}.pl-act.primary{border-color:#3E9AE6;background:linear-gradient(180deg,#eef5fc,#fff)}'
 + '.pl-deals{background:var(--surface,#fff);border:1px solid var(--line,#dbe4ec);border-radius:10px;overflow:hidden}.pl-deal{display:grid;grid-template-columns:minmax(120px,2fr) repeat(3,minmax(70px,1fr)) auto;gap:10px;align-items:center;padding:10px 14px;border-top:1px solid var(--line,#dbe4ec);font-size:13px}.pl-deal:first-child{border-top:0}.pl-deal small{display:block;color:var(--ink-500,#566a80);font-size:11px}'
 + '.pl-steps{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-top:6px}.pl-step{padding:12px 14px;border-left:3px solid #3E9AE6;background:rgba(62,154,230,.08);border-radius:0 8px 8px 0;font-size:12.5px;line-height:1.45}.pl-step b{display:block;font-size:13px;margin-bottom:2px}'
 + '.pl-detail{margin-top:26px}.pl-detail>summary{cursor:pointer;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-500,#566a80);padding:10px 0}'
 + '@media (max-width:640px){.pl-row{grid-template-columns:18px 1fr auto}.pl-row .r{grid-column:2 / 4;grid-row:2}.pl-deal{grid-template-columns:1fr auto}.pl-deal>div:nth-child(n+2):not(:last-child){display:none}.pl-hero h2{font-size:24px}}';
if(!document.getElementById('pl-home-css')){ var st = document.createElement('style'); st.id = 'pl-home-css'; st.textContent = CSS; document.head.appendChild(st); }

window.bkGo = function(sheet){ if(typeof showSheet === 'function') showSheet(sheet); try { window.scrollTo(0, 0); } catch(e){} };
function go(sheet){ return 'onclick="bkGo(\'' + sheet.replace(/'/g, "\\'") + '\')"'; }
function savedDeals(){ var cur = safe(function(){ return bkLoad(); }, {}), ck = String(cur.dealId || cur.name || ''); return safe(function(){ return bkPortfolioLoad(); }, []).map(function(d){ var key = String(d.dealId || d.name || 'untitled'); var m = safe(function(){ return bkPortfolioMetricsFor(d); }, {}); return { key:key, d:d, m:m, active:key === ck }; }); }
window.bkHomeOpen = function(i){ var L = savedDeals(); if(L[i] && typeof bkPortfolioLoadActive === 'function') bkPortfolioLoadActive(L[i].key); };

function dealsBlock(L, cur){
  if(!L.length) return '';
  return '<div class="pl-h">Saved deals</div><div class="pl-deals">' + L.slice(0, 8).map(function(x, i){ var d = x.d, m = x.m || {};
    return '<div class="pl-deal"><div><b>' + esc(d.name || d.dealId || 'Untitled') + '</b><small>' + esc([d.dealType, d.propertyType, d.location].filter(Boolean).join(' · ')) + '</small></div><div>' + M(d.purchasePrice) + '<small>price</small></div><div>' + P(m.irr) + '<small>levered IRR</small></div><div>' + X(m.moic) + '<small>multiple</small></div>'
      + '<div>' + (x.active ? '<span class="status-chip pass">OPEN</span>' : '<button type="button" class="status-chip" onclick="bkHomeOpen(' + i + ')">OPEN</button>') + '</div></div>'; }).join('') + '</div>';
}
function frontDoor(L){
  var steps = [['1  Bring the deal in', 'Upload a Yardi T-12 or a rent roll, or type the deal in.'], ['2  Check the model', 'Contradictions, market ranges and credit policy are checked as you go.'], ['3  Stress it', 'Downside cases, break-evens and probability-weighted returns.'], ['4  Take it to committee', 'IC memo with the decision, the cushions and the risks.']];
  return '<div class="pl-home"><div class="pl-hero"><h2>Underwrite a deal</h2><p class="pl-sub">Start from a rent roll or T-12, or from a blank deal. Nothing is calculated from placeholder numbers: figures appear once the required inputs are in.</p></div>'
    + '<div class="pl-acts"><button type="button" class="pl-act primary" onclick="bkGuideOn()"><b>Guide me step by step</b><span>One question at a time, in a logical order, from blank or from a document. Nothing changes until you confirm it.</span></button><button type="button" class="pl-act" ' + go('Import OM') + '><b>Import an offering memorandum</b><span>Upload the broker\'s OM (PDF). Price, units, rents, income and expenses load into a new deal, with the OM and its photo kept on the deal.</span></button><button type="button" class="pl-act" ' + go('Import Deal') + '><b>Import a T-12</b><span>Upload a Yardi workbook, CSV or PDF. Line items are footed to the statement and the price is set from the cap rate.</span></button>'
    + '<button type="button" class="pl-act" ' + go('Import Rent Roll') + '><b>Import a rent roll</b><span>Map the columns, review every unit, and apply it to the active deal.</span></button>'
    + '<button type="button" class="pl-act" onclick="bkCreateNewDeal()"><b>Start a blank deal</b><span>Enter the property, income, expenses and debt yourself.</span></button>'
    + '<button type="button" class="pl-act" ' + go('Source Ingestion') + '><b>Review a source package</b><span>Stage a workbook, reconcile it, and approve each figure before it reaches a deal.</span></button></div>'
    + dealsBlock(L) + '<div class="pl-h">How it works</div><div class="pl-steps">' + steps.map(function(t){ return '<div class="pl-step"><b>' + t[0] + '</b>' + t[1] + '</div>'; }).join('') + '</div></div>';
}
function build(s, oldMain){
  var dev = isDev(s), h = safe(function(){ return window.bkHeadline(); }, null), pol = safe(function(){ return bkPolicy(); }, {}), ready = safe(function(){ return bkDealReadiness(); }, null);
  var gate = dev ? null : safe(function(){ return bkDealGate(); }, null), ctl = safe(function(){ return bkModelControls(); }, []), mk = dev ? null : safe(function(){ return bkMarketCompare(); }, null);
  var fails = ctl.filter(function(c){ return c.level === 'FAIL'; }), warns = ctl.filter(function(c){ return c.level !== 'FAIL'; });
  var hurdle = Number(pol.targetIRR) || 0.12, mind = Number(pol.minDSCR) || 1.25, em = Number(pol.targetEM) || 2.0, can = ready && ready.canCalculate;
  var irrOk = h && isFinite(h.levIRR) ? (h.levIRR >= hurdle ? 'pass' : (h.levIRR >= hurdle - 0.03 ? 'warn' : 'fail')) : '';
  var dscrOk = h && isFinite(h.dscr) && h.dscr ? (h.dscr >= mind ? 'pass' : 'fail') : '';
  var price = Number(s.purchasePrice) || 0, loan = h ? Number(h.loan) || 0 : 0;
  var kpis = can && h ? [
    ['Levered IRR', P(h.levIRR), 'target ' + P(hurdle), irrOk, 'Returns'], ['Equity multiple', X(h.levMOIC), 'target ' + X(em), isFinite(h.levMOIC) ? (h.levMOIC >= em ? 'pass' : 'warn') : '', 'Returns'],
    [dev ? 'Yield on cost' : 'Yield on cost', P(h.yoc), 'exit cap ' + P(Number(s.exitCap)), '', dev ? 'Development' : 'Operating Underwrite'], ['Year-1 DSCR', X(h.dscr), 'policy min ' + X(mind), dscrOk, 'Debt'],
    ['Loan', M(loan), price ? P(loan / price, 0) + ' of price' : '', '', 'Debt'], ['Equity', M(h.equity), price ? 'price ' + M(price) : '', '', 'Sources & Uses']] : [];
  var next;
  if(!can){ var miss = (ready && ready.missing || []).slice(0, 4).map(function(m){ return m.label; }); next = ['Finish the required inputs', (ready ? ready.missing.length : 'Some') + ' still missing' + (miss.length ? ': ' + miss.join(', ') + (ready.missing.length > 4 ? '…' : '') : '') + '. Results stay hidden until they are in.', 'Deal Underwrite', 'Go to Deal Underwrite']; }
  else if(fails.length) next = ['Fix ' + fails.length + ' model error' + (fails.length === 1 ? '' : 's'), esc(fails[0].area + ': ' + String(fails[0].msg).split(' Why it matters')[0]), 'Model Checks', 'Open Model Checks'];
  else if(gate && gate.verdict === 'DECLINE') next = ['Credit gate says decline', 'The deal fails ' + gate.hard + ' hard and ' + gate.soft + ' soft policy tests. Resize the debt, change the price, or record a documented override.', 'Debt Capacity', 'Open Debt Capacity'];
  else if(warns.length) next = ['Review ' + warns.length + ' warning' + (warns.length === 1 ? '' : 's'), esc(warns[0].area + ': ' + String(warns[0].msg).split(' Why it matters')[0]), 'Model Checks', 'Open Model Checks'];
  else next = ['Ready for committee', 'Inputs are complete and no checks are open. Stress the deal, then open the IC memo.', 'IC Memo', 'Open the IC memo'];
  var rows = [];
  rows.push([can ? 'pass' : 'fail', 'Required inputs', can ? 'All ' + (Array.isArray(ready.met) ? ready.met.length + ' ' : '') + 'required inputs entered' : (ready ? ready.missing.length : '?') + ' missing', 'Deal Underwrite']);
  if(can && h){
    rows.push([irrOk || '', 'Returns vs hurdle', 'Levered IRR ' + P(h.levIRR) + ' against a ' + P(hurdle) + ' target; ' + X(h.levMOIC) + ' multiple', 'Returns']);
    if(!dev){ var cap = gate && gate.capacity; rows.push([cap ? (cap.overage > 0 ? 'warn' : 'pass') : '', 'Debt against policy', cap ? (cap.overage > 0 ? 'Loan is ' + M(cap.overage) + ' above what policy supports (' + M(cap.capacity) + ', binding on ' + esc(cap.binding && cap.binding.name || 'policy') + ')' : 'Loan is within policy capacity (' + M(cap.capacity) + ')') : 'DSCR ' + X(h.dscr), 'Debt Capacity']); }
    if(gate) rows.push([gate.verdict === 'APPROVE' ? 'pass' : gate.verdict === 'DECLINE' ? 'fail' : 'warn', 'Credit decision', esc(String(gate.status || gate.verdict).replace(/\s+—\s+/, ': ')), 'IC Memo']);
    if(!dev){ var rk = safe(function(){ return bkRiskScenarios(); }, null); if(rk) rows.push([rk.pLoss > 0.2 ? 'warn' : 'pass', 'Downside odds', 'Scenario-weighted: ' + P(rk.pLoss, 0) + ' chance of losing money, ' + P(rk.pMiss, 0) + ' chance of missing the hurdle; expected IRR ' + P(rk.irrOfExpectedCF), 'Probability-Weighted']); }
  }
  if(!dev) rows.push([Array.isArray(s.rentRoll) && s.rentRoll.length ? 'pass' : 'warn', 'Rent roll', Array.isArray(s.rentRoll) && s.rentRoll.length ? s.rentRoll.length + ' units loaded; revenue is built from them' : 'No unit rent roll: revenue uses the flat average rent per unit, with no loss to lease or rollover', 'Import Rent Roll']);
  rows.push([fails.length ? 'fail' : (warns.length ? 'warn' : 'pass'), 'Model checks', fails.length || warns.length ? fails.length + ' error' + (fails.length === 1 ? '' : 's') + ', ' + warns.length + ' warning' + (warns.length === 1 ? '' : 's') : 'No contradictions found', 'Model Checks']);
  if(mk && mk.rows){ var out = mk.rows.filter(function(r){ return r.status === 'ABOVE RANGE' || r.status === 'BELOW RANGE'; }); rows.push([out.length ? 'warn' : 'pass', 'Against the market', out.length ? out.length + ' of ' + mk.rows.length + ' assumptions outside published ranges' : 'All ' + mk.rows.length + ' assumptions inside published ranges', 'Market Benchmarks']); }
  if(ready && ready.sourceExceptions) rows.push(['warn', 'Sources', (ready.sourceExceptions.length != null ? ready.sourceExceptions.length : ready.sourceExceptions) + ' source finding(s) to review', 'Source Lineage']);
  var L = savedDeals(), inList = L.some(function(x){ return x.active; });
  var acts = [['Import an OM', 'Load a broker offering memorandum into a new deal.', 'Import OM'], ['Deal documents and photo', 'Keep the OM, T-12, CoStar and listing with the deal.', 'Deal Documents'], ['Import a T-12', 'Replace the income and expenses from a Yardi statement.', 'Import Deal'], ['Import a rent roll', 'Load units, rents and lease dates.', 'Import Rent Roll'], ['Stress the deal', 'Tornado, heat map and break-evens.', 'Sensitivity'], ['Probability-weighted returns', 'Odds of loss and of missing the hurdle.', 'Probability-Weighted'], [dev ? 'Development budget' : 'Debt capacity', dev ? 'Cost ladder and funding.' : 'How much debt policy supports.', dev ? 'Development' : 'Debt Capacity'], ['IC memo', 'The decision, the cushions and the risks.', 'IC Memo']];
  var tag = function(l, c){ return '<span class="status-chip ' + (c || '') + '">' + l + '</span>'; };
  var rd = ready ? String(ready.state || '') : '';
  return '<div class="pl-home"><div class="pl-hero"><h2>' + esc(s.name || 'Untitled deal') + '</h2><p class="pl-sub">' + esc([s.dealType, s.propertyType, s.location, s.units ? s.units + (dev ? ' units planned' : ' units') : '', s.closing ? (dev ? 'start ' : 'closing ') + s.closing : ''].filter(Boolean).join(' · ')) + '</p>'
    + '<div class="pl-chips">' + tag(esc(rd || 'DRAFT'), /READY/.test(rd) ? 'pass' : 'warn') + tag(esc(String(s.scenarioCase || 'Base')) + ' CASE', '') + (price ? tag('Price ' + M(price), '') : '') + '</div></div>'
    + (kpis.length ? '<div class="pl-kpis">' + kpis.map(function(k){ return '<button type="button" class="pl-kpi ' + k[3] + '" ' + go(k[4]) + '><div class="k">' + k[0] + '</div><div class="v">' + k[1] + '</div><div class="s">' + esc(k[2]) + '</div></button>'; }).join('') + '</div>' : '')
    + '<div class="pl-next"><div><div class="t">Next step</div><div class="m">' + next[0] + '</div><div class="d">' + next[1] + '</div></div><div style="display:flex;gap:8px;flex-wrap:wrap">' + ((gate && gate.capacity && gate.capacity.overage > 0) ? '<button type="button" class="pl-btn ghost" onclick="bkSizeLoanDialog()">Size loan to policy</button>' : '') + '<button type="button" class="pl-btn" ' + go(next[2]) + '>' + esc(next[3]) + ' &rarr;</button></div></div>'
    + '<div class="pl-h">Review checklist</div><div class="pl-check">' + rows.map(function(r){ return '<div class="pl-row ' + r[0] + '" role="button" tabindex="0" ' + go(r[3]) + '><span class="dot"></span><span class="l">' + r[1] + '</span><span class="r">' + r[2] + '</span><span class="go">Open &rarr;</span></div>'; }).join('') + '</div>'
    + '<div class="pl-h">Go to</div><div class="pl-acts">' + acts.map(function(a){ return '<button type="button" class="pl-act" ' + go(a[2]) + '><b>' + a[0] + '</b><span>' + a[1] + '</span></button>'; }).join('') + '</div>'
    + dealsBlock(L) + (inList ? '' : '<div style="margin-top:12px"><button type="button" class="status-chip" onclick="bkPortfolioAddCurrent()">SAVE THIS DEAL TO THE PORTFOLIO</button></div>')
    + '<details class="pl-detail"><summary>Certification and module detail</summary>' + oldMain + '</details></div>';
}
RENDERERS['Home'] = function(){
  var o = prev.apply(this, arguments); if(!o || typeof o !== 'object') return o;
  var active = typeof window.bkHasActiveDeal === 'function' ? window.bkHasActiveDeal() : true, s = safe(function(){ return bkLoad(); }, null);
  if(!active || !s){ return Object.assign({}, o, { title:'', crumbs:'', desc:'', meta:{}, sidebar:'', main:frontDoor(savedDeals()) }); }
  return Object.assign({}, o, { title:'', crumbs:'', desc:'', meta:{}, sidebar:'', main:build(s, String(o.main || '')) });
};
if(typeof window.bkRegisterRenderer === 'function') try { window.bkRegisterRenderer('Home', RENDERERS['Home']); } catch(e){}
document.addEventListener('keydown', function(e){ var r = e.target && e.target.closest && e.target.closest('.pl-row'); if(r && (e.key === 'Enter' || e.key === ' ')){ e.preventDefault(); r.click(); } });
})();
