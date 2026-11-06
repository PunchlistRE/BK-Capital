
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
 + '.pl-ans{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:6px 0 14px}@media (max-width:1000px){.pl-ans{grid-template-columns:repeat(2,minmax(0,1fr))}}@media (max-width:520px){.pl-ans{grid-template-columns:minmax(0,1fr)}}'
 + '.pl-an{display:flex;flex-direction:column;align-items:flex-start;gap:6px;text-align:left;background:var(--surface,#fff);border:1px solid var(--line,#dbe4ec);border-radius:10px;padding:14px 14px 16px;cursor:pointer;color:var(--ink-900,#10233a);font:inherit;min-height:118px}'
 + '.pl-an:hover,.pl-an:focus-visible{border-color:#3E9AE6;box-shadow:0 4px 14px rgba(16,25,34,.10);outline:none}.pl-an .ic{color:#12609f;display:flex}.pl-an b{font-size:14px;line-height:1.3}.pl-an .q{font-size:12.5px;line-height:1.45;color:var(--ink-500,#566a80)}'
 + '.pl-an.off{cursor:default;opacity:.62}.pl-an.off:hover{border-color:var(--line,#dbe4ec);box-shadow:none}.pl-an .soon{margin-top:auto;font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;font-weight:700;color:var(--ink-500,#566a80)}'
 + '.pl-docs{font-size:13px;color:var(--ink-500,#566a80);margin:4px 0 6px;display:flex;flex-wrap:wrap;gap:4px;align-items:baseline}.pl-link{background:none;border:0;padding:0;font:inherit;color:#12609f;cursor:pointer;text-decoration:underline;text-underline-offset:2px}.pl-link:hover{color:#0e2a4a}'
 + '@media (prefers-color-scheme:dark){:root:not([data-theme="light"]) .pl-link,:root:not([data-theme="light"]) .pl-an .ic{color:#8cc4f2}:root:not([data-theme="light"]) .pl-link:hover{color:#cfe6fa}}:root[data-theme="dark"] .pl-link,:root[data-theme="dark"] .pl-an .ic{color:#8cc4f2}:root[data-theme="dark"] .pl-link:hover{color:#cfe6fa}'
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
/* the front door with no deal open: the analyses (from the analysis registry, so this page always lists exactly what the platform defines), then one quiet line for starting from a document */
function frontDoor(L){
  var R = window.BKReg, list = R ? R.analyses() : [];
  var cards = list.map(function(a){ var live = !!a.live;
    return '<button type="button" class="pl-an' + (live ? '' : ' off') + '"' + (live ? ' onclick="bkStartAnalysis(\'' + a.id + '\')"' : ' aria-disabled="true" tabindex="-1"') + ' data-analysis="' + a.id + '"><span class="ic">' + (R.icon ? R.icon(a.icon) : '') + '</span><b>' + esc(a.name) + '</b><span class="q">' + esc(a.q) + '</span>' + (live ? '' : '<span class="soon">In development</span>') + '</button>'; }).join('');
  var docs = [['Offering memorandum', 'Import'], ['T-12', 'Import'], ['Rent roll', 'Import'], ['Pro forma or source package', 'Import']];
  return '<div class="pl-home pl-front"><div class="pl-hero"><h2>Start an analysis</h2><p class="pl-sub">Pick the question you are answering. Each analysis asks for what it needs and nothing else.</p></div>'
    + '<div class="pl-ans">' + cards + '</div>'
    + '<p class="pl-docs">Or start from a document: ' + docs.map(function(d){ return '<button type="button" class="pl-link" ' + go(d[1]) + '>' + d[0] + '</button>'; }).join('<span aria-hidden="true"> · </span>') + '</p>'
    + dealsBlock(L) + '</div>';
}
/* the Overview of an analysis with its own engine (Refinancing, and the analyses that follow): the registry's tiles from its summary, the next step, and its workflow as the checklist */
function buildOwn(s, a){ var R = window.BKReg, sm = safe(function(){ return R.summarize(s); }, null), ready = safe(function(){ return bkDealReadiness(); }, null), can = ready && ready.canCalculate;
  var fmt = function(m){ var v = m.value; if(v === null || v === undefined) return '-'; return m.fmt === 'pct' ? P(v, 2) : m.fmt === 'x' ? X(v) : m.fmt === 'int' ? String(Math.round(v)) : M(v); };
  var all = sm ? [sm.primary].concat(sm.metrics) : [], byId = {}; all.forEach(function(m){ byId[m.id] = m; });
  var kpis = can ? R.tiles(a.id).map(function(id){ var m = byId[id] || (function(){ var d = R.metric(id); return d ? { id:id, label:d.label, fmt:d.fmt, note:d.note || '', value:safe(function(){ return R.summarize(s).metrics.concat([R.summarize(s).primary]).filter(function(x){ return x.id === id; })[0].value; }, null) } : null; })(); return m; }).filter(Boolean) : [];
  var wf = ready && ready.workflow || [], miss = (ready && ready.missing || []);
  var next = !can ? ['Finish the required inputs', miss.length ? miss.length + ' still missing: ' + miss.slice(0, 4).map(function(m){ return m.label; }).join(', ') + (miss.length > 4 ? '…' : '') + '.' : 'The analysis cannot run yet' + (ready && ready.blockers && ready.blockers.length ? ': ' + esc(ready.blockers[0]) : '.'), a.home || 'Home', 'Open ' + (a.home || 'the analysis')] : ['Ready to report', esc(sm && sm.question ? sm.question : '') + ' The report is built from the same figures.', a.id === 'refinance' ? 'Refinance Report' : 'Reports', 'Open the report'];
  var rows = wf.map(function(x){ var st = (R.workflow(a.id).filter(function(y){ return y.id === x.id; })[0]) || {}; return [x.complete ? 'pass' : (x.skippable ? '' : 'warn'), x.title, x.complete ? 'Complete' : (x.missing.length ? 'Missing: ' + x.missing.map(function(k){ var f = R.field(k); return f ? f.label : k; }).join(', ') : (x.skippable ? 'Optional' : '')), st.sheet || a.home]; });
  var tag = function(l, c){ return '<span class="status-chip ' + (c || '') + '">' + l + '</span>'; }, rd = ready ? String(ready.state || '') : '';
  return '<div class="pl-home"><div class="pl-hero"><h2>' + esc(s.name || 'Untitled') + '</h2><p class="pl-sub">' + esc([a.name, s.propertyType, s.location, s.units ? s.units + ' units' : ''].filter(Boolean).join(' · ')) + '</p><div class="pl-chips">' + tag(esc(rd || 'DRAFT'), /READY/.test(rd) ? 'pass' : 'warn') + '</div></div>'
    + (kpis.length ? '<div class="pl-kpis">' + kpis.map(function(m){ return '<button type="button" class="pl-kpi" ' + go(a.home || 'Home') + '><div class="k">' + esc(m.label) + '</div><div class="v">' + fmt(m) + '</div><div class="s">' + esc(m.note || '') + '</div></button>'; }).join('') + '</div>' : '')
    + '<div class="pl-next"><div><div class="t">Next step</div><div class="m">' + next[0] + '</div><div class="d">' + next[1] + '</div></div><div><button type="button" class="pl-btn" ' + go(next[2]) + '>' + esc(next[3]) + '</button></div></div>'
    + '<div class="pl-h">' + esc(a.name) + ' steps</div><div class="pl-check">' + rows.map(function(r){ return '<div class="pl-row ' + r[0] + '" role="button" tabindex="0" ' + go(r[3]) + '><span class="dot"></span><span class="l">' + esc(r[1]) + '</span><span class="r">' + esc(r[2]) + '</span><span class="go">Open &rarr;</span></div>'; }).join('') + '</div></div>';
}
function build(s, oldMain){
  var an = safe(function(){ return window.BKReg.of(s); }, null); if(an && an.ownReadiness) return buildOwn(s, an);
  var dev = isDev(s), h = safe(function(){ return window.bkHeadline(); }, null), pol = safe(function(){ return bkPolicy(); }, {}), ready = safe(function(){ return bkDealReadiness(); }, null);
  var gate = dev ? null : safe(function(){ return bkDealGate(); }, null), ctl = safe(function(){ return bkModelControls(); }, []), mk = dev ? null : safe(function(){ return bkMarketCompare(); }, null);
  var fails = ctl.filter(function(c){ return c.level === 'FAIL'; }), warns = ctl.filter(function(c){ return c.level !== 'FAIL'; });
  var hurdle = Number(pol.targetIRR) || 0.12, mind = bkLenderDscrMin(), em = Number(pol.targetEM) || 2.0, can = ready && ready.canCalculate;
  var irrOk = h && isFinite(h.levIRR) ? (h.levIRR >= hurdle ? 'pass' : (h.levIRR >= hurdle - 0.03 ? 'warn' : 'fail')) : '';
  var dscrOk = h && isFinite(h.dscr) && h.dscr ? (h.dscr >= mind ? 'pass' : 'fail') : '';
  var price = Number(s.purchasePrice) || 0, loan = h ? Number(h.loan) || 0 : 0;
  /* the tiles: which figures lead, and in what order, come from the analysis registry (src/139h); each is read from the same headline as the Deal Snapshot */
  var TILE = { leveredIRR:function(){ return ['Levered IRR', P(h.levIRR), 'target ' + P(hurdle), irrOk, 'Returns']; }, moic:function(){ return ['Equity multiple', X(h.levMOIC), 'target ' + X(em), isFinite(h.levMOIC) ? (h.levMOIC >= em ? 'pass' : 'warn') : '', 'Returns']; },
    yieldOnCost:function(){ return ['Yield on cost', P(h.yoc), 'exit cap ' + P(Number(s.exitCap)), '', dev ? 'Development' : 'Operating Underwrite']; }, dscr:function(){ return ['Lender DSCR, year 1', X(h.dscr), bkDscrBasis('lender', s) + ' · loan min ' + X(mind), dscrOk, 'Debt']; },
    loan:function(){ return ['Loan', M(loan), price ? P(loan / price, 0) + ' of price' : '', '', 'Debt']; }, equity:function(){ var tce = isFinite(h.tce) ? h.tce : h.equity; return [typeof window.bkCapName === 'function' ? window.bkCapName('totalContributedEquity') : 'Total contributed equity', M(tce), price ? 'price ' + M(price) : '', '', 'Sources & Uses']; } };   /* the headline equity names its measure, as the bottom band and the Deal Snapshot do */
  var tileIds = safe(function(){ return window.BKReg.tiles(window.BKReg.of(s).id); }, null) || ['leveredIRR', 'moic', 'yieldOnCost', 'dscr', 'loan', 'equity'];
  var kpis = can && h ? tileIds.filter(function(id){ return TILE[id]; }).map(function(id){ return TILE[id](); }) : [];
  var next;
  if(!can){ var miss = (ready && ready.missing || []).slice(0, 4).map(function(m){ return m.label; }); next = ['Finish the required inputs', (ready ? ready.missing.length : 'Some') + ' still missing' + (miss.length ? ': ' + miss.join(', ') + (ready.missing.length > 4 ? '…' : '') : '') + '. Results stay hidden until they are in.', 'Deal Underwrite', 'Go to Deal Underwrite']; }
  else if(fails.length) next = ['Fix ' + fails.length + ' model error' + (fails.length === 1 ? '' : 's'), esc(fails[0].area + ': ' + String(fails[0].msg).split(' Why it matters')[0]), 'Model Checks', 'Open Model Checks'];
  else if(gate && /^(DECLINE|HOLD)$/.test(gate.verdict)) next = ['Credit gate says decline', 'The deal fails ' + gate.hard + ' hard and ' + gate.soft + ' soft policy tests. Resize the debt, change the price, or record a documented override.', 'Debt Capacity', 'Open Debt Capacity'];
  else if(warns.length) next = ['Review ' + warns.length + ' warning' + (warns.length === 1 ? '' : 's'), esc(warns[0].area + ': ' + String(warns[0].msg).split(' Why it matters')[0]), 'Model Checks', 'Open Model Checks'];
  else next = ['Ready for committee', 'Inputs are complete and no checks are open. Stress the deal, then open the IC memo.', 'IC Memo', 'Open the IC memo'];
  var rows = [];
  rows.push([can ? 'pass' : 'fail', 'Required inputs', can ? 'All ' + (Array.isArray(ready.met) ? ready.met.length + ' ' : '') + 'required inputs entered' : (ready ? ready.missing.length : '?') + ' missing', 'Deal Underwrite']);
  if(can){ var tt = safe(function(){ return window.bkAllInputsTie(); }, null); if(tt && !tt.withheld) rows.push([tt.ok ? 'pass' : 'fail', 'All inputs tie', tt.ok ? tt.checks + ' checks agree across Sources & Uses, Debt, Funding and Returns' : tt.failed.length + ' do not tie: ' + tt.failed[0].label, 'Sources & Uses']); }
  if(can && h){
    rows.push([irrOk || '', 'Returns vs hurdle', 'Levered IRR ' + P(h.levIRR) + ' against a ' + P(hurdle) + ' target; ' + X(h.levMOIC) + ' multiple', 'Returns']);
    if(!dev){ var cap = gate && gate.capacity; rows.push([cap ? (cap.overage > 0 ? 'warn' : 'pass') : '', 'Debt against policy', cap ? (cap.overage > 0 ? 'Loan is ' + M(cap.overage) + ' above what policy supports (' + M(cap.capacity) + ', binding on ' + esc(cap.binding && (cap.binding.label || cap.binding.name) || 'policy') + ')' : 'Loan is within policy capacity (' + M(cap.capacity) + ')') : 'Lender DSCR ' + X(h.dscr), 'Debt Capacity']); }
    if(gate) rows.push([gate.verdict === 'APPROVE' ? 'pass' : /^(DECLINE|HOLD)$/.test(gate.verdict) ? 'fail' : 'warn', 'Credit decision', esc(String(gate.status || gate.verdict).replace(/\s+—\s+/, ': ')), 'IC Memo']);
    if(!dev){ var rk = safe(function(){ return bkRiskScenarios(); }, null); if(rk) rows.push([rk.pLoss > 0.2 ? 'warn' : 'pass', 'Downside odds', 'Scenario-weighted: ' + P(rk.pLoss, 0) + ' chance of losing money, ' + P(rk.pMiss, 0) + ' chance of missing the hurdle; expected IRR ' + P(rk.irrOfExpectedCF), 'Probability-Weighted']); }
  }
  if(!dev) rows.push([Array.isArray(s.rentRoll) && s.rentRoll.length ? 'pass' : 'warn', 'Rent roll', Array.isArray(s.rentRoll) && s.rentRoll.length ? s.rentRoll.length + ' units loaded; revenue is built from them' : 'No unit rent roll: revenue uses the flat average rent per unit, with no loss to lease or rollover', 'Import Rent Roll']);
  rows.push([fails.length ? 'fail' : (warns.length ? 'warn' : 'pass'), 'Model checks', fails.length || warns.length ? fails.length + ' error' + (fails.length === 1 ? '' : 's') + ', ' + warns.length + ' warning' + (warns.length === 1 ? '' : 's') : 'No contradictions found', 'Model Checks']);
  if(mk && mk.rows){ var out = mk.rows.filter(function(r){ return r.status === 'ABOVE RANGE' || r.status === 'BELOW RANGE'; }); rows.push([out.length ? 'warn' : 'pass', 'Against the market', out.length ? out.length + ' of ' + mk.rows.length + ' assumptions outside published ranges' : 'All ' + mk.rows.length + ' assumptions inside published ranges', 'Market Benchmarks']); }
  if(ready && ready.sourceExceptions) rows.push(['warn', 'Sources', (ready.sourceExceptions.length != null ? ready.sourceExceptions.length : ready.sourceExceptions) + ' source finding(s) to review', 'Source Lineage']);
  var L = savedDeals(), inList = L.some(function(x){ return x.active; });
  var acts = [['Import an OM', 'Drop an offering memorandum, listing, T-12, pro forma or rent roll; the reader works out which it is.', 'Import'], ['Deal documents and photo', 'Keep the OM, T-12, CoStar and listing with the deal.', 'Deal Documents'], ['Import a T-12', 'Replace the income and expenses from a Yardi statement.', 'Import Deal'], ['Import a rent roll', 'Load units, rents and lease dates.', 'Import Rent Roll'], ['Stress the deal', 'Tornado, heat map and break-evens.', 'Sensitivity'], ['Probability-weighted returns', 'Odds of loss and of missing the hurdle.', 'Probability-Weighted'], [dev ? 'Development budget' : 'Debt capacity', dev ? 'Cost ladder and funding.' : 'How much debt policy supports.', dev ? 'Development' : 'Debt Capacity'], ['IC memo', 'The decision, the cushions and the risks.', 'IC Memo']];
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
