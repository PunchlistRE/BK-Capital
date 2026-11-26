/* EQUITY PARTNERS, deal by deal. For every saved portfolio deal: who the partners are (GP and LP entities, their shares and dollars, the pref), what the
   deal is meant to do (target return and the plan), where it is in its life, what it has returned this year and since closing, how rents and expenses
   are set to grow, what it is worth today, its NOI this year to date and for the year, and what is coming up (capital items, reserves, leases ending,
   vacant units). Every figure is read from the deal's own saved snapshot and the engine's own monthly rows (bkPortfolioMonthlyFor); actuals entered on
   Budget vs Actual replace the projection for the months they cover. The entities and the plan are typed here and saved on the deal. */
(function(){
'use strict';
function safe(f, d){ try { var v = f(); return v === undefined ? d : v; } catch(e){ return d; } }
function esc(t){ return String(t == null ? '' : t).replace(/[&<>"]/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]; }); }
function num(v){ v = Number(v); return isFinite(v) ? v : 0; }
function M(v){ if(v == null || !isFinite(v)) return '—'; var r = Math.round(v); return r < 0 ? '($' + Math.abs(r).toLocaleString('en-US') + ')' : '$' + r.toLocaleString('en-US'); }
function P(v, d){ return v == null || !isFinite(v) ? '—' : (v * 100).toFixed(d == null ? 1 : d) + '%'; }
function X(v){ return v == null || !isFinite(v) ? '—' : v.toFixed(2) + 'x'; }
function ymOf(d){ return d.getUTCFullYear() + '-' + ('0' + (d.getUTCMonth() + 1)).slice(-2); }
function parseD(t){ var m = /^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?/.exec(String(t || '')); if(m) return new Date(Date.UTC(+m[1], +m[2] - 1, +(m[3] || 1))); m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/.exec(String(t || '')); if(m) return new Date(Date.UTC(+m[3] < 100 ? 2000 + +m[3] : +m[3], +m[1] - 1, +m[2])); return null; }
var FIELDS = { gpEntity:1, lpEntity:1, epPlan:1, epTargetIRR:1 };
window.bkEPSet = function(key, field, value){
  if(!FIELDS[field]) return; var arr = bkPortfolioLoad(), v = String(value == null ? '' : value).trim();
  if(field === 'epTargetIRR'){ var n = parseFloat(v.replace(/[^0-9.\-]/g, '')); v = isFinite(n) ? (n > 1 ? n / 100 : n) : null; }
  arr.forEach(function(s){ if(bkPortfolioKey(s) === key) s[field] = v; }); bkPortfolioSave(arr);
  var cur = safe(function(){ return bkLoad(); }, null); if(cur && bkPortfolioKey(cur) === key){ cur[field] = v; bkSave(cur); }   /* the active deal keeps it too, so saving it again does not lose it */
  if(typeof showSheet === 'function') showSheet('Equity Partners'); };

/* one deal, worked out from its snapshot and the engine's monthly rows */
function dealView(s, now){
  var key = bkPortfolioKey(s), res = safe(function(){ return bkPortfolioMonthlyFor(s); }, { ok:false }), m = safe(function(){ return bkPortfolioMetricsFor(s); }, { ok:false }) || { ok:false };
  var o = { s:s, key:key, ok:!!(res && res.ok && m.ok), m:m, err:(res && res.error) || m.error || '' }; if(!o.ok) return o;
  var r = res.r, rows = (r.rows || []).map(function(x){ return Object.assign({ d:new Date(x.dt) }, x); }), dev = /develop/i.test(String(s.dealType || ''));
  var close = r.closeDt ? new Date(r.closeDt) : (parseD(s.closing) || (rows[0] && rows[0].d)), H = Math.max(1, Math.round(num(s.holdYears) || rows.length / 12)), holdM = rows.length;
  var yStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1)), yEnd = new Date(Date.UTC(now.getUTCFullYear() + 1, 0, 1)), in12 = new Date(now.getTime()); in12.setUTCMonth(in12.getUTCMonth() + 12);
  var past = rows.filter(function(x){ return x.d <= now; }), monthsIn = past.length, closed = close && close <= now;
  /* actuals entered on Budget vs Actual replace the projection month by month */
  var act = {}; (Array.isArray(s.actuals) ? s.actuals : []).forEach(function(a){ if(a && a.ym) act[a.ym] = a; });
  var noiOf = function(x){ var a = act[ymOf(x.d)]; return a ? num(a.revenue) - num(a.opex) : x.noi; }, isAct = function(x){ return !!act[ymOf(x.d)]; };
  var ytdRows = rows.filter(function(x){ return x.d >= yStart && x.d <= now; }), yrRows = rows.filter(function(x){ return x.d >= yStart && x.d < yEnd; }), fwd = rows.filter(function(x){ return x.d > now && x.d <= in12; });
  o.dev = dev; o.close = close; o.closed = closed; o.H = H; o.monthsIn = Math.min(monthsIn, holdM); o.holdM = holdM;
  /* where it is in its life */
  var cm = num(s.constructionMonths), lu = num(s.leaseupMonths), rs = num(s.renoStartYear) || 1, ry = num(s.renoYears) || 1, yrNow = Math.floor(monthsIn / 12) + 1;
  o.stage = !closed ? 'Pre-closing' : monthsIn >= holdM ? 'Past the planned sale' : dev && monthsIn < cm ? 'Construction' : dev && monthsIn < cm + lu ? 'Lease-up'
    : monthsIn >= holdM - 12 ? 'Sale window (final year)' : num(s.renoUnitsPerYear) > 0 && yrNow >= rs && yrNow < rs + ry ? 'Value-add: renovating units' : monthsIn < 12 ? 'First year of operations' : 'Stabilized operations';
  o.lifePct = holdM ? Math.min(1, Math.max(0, monthsIn / holdM)) : 0; o.saleDate = rows.length ? rows[rows.length - 1].d : null;
  /* returns: what equity has put in and taken out, this year and since closing, from the engine's own distribution rows */
  var sumK = function(list, k){ return list.reduce(function(t, x){ return t + num(x[k]); }, 0); };
  o.ytdDist = sumK(ytdRows, 'wfDist'); o.lifeDist = sumK(past, 'wfDist'); o.lifeContrib = sumK(past, 'wfContrib');
  o.yieldYtd = m.equity ? o.ytdDist / m.equity : null; o.lifeMultiple = o.lifeContrib ? o.lifeDist / o.lifeContrib : null;
  /* NOI: this year to date, the year as a whole (actual months, then the projection), and the next twelve months */
  o.ytdNoi = ytdRows.reduce(function(t, x){ return t + noiOf(x); }, 0); o.ytdActual = ytdRows.filter(isAct).length; o.ytdMonths = ytdRows.length;
  o.yrNoi = yrRows.reduce(function(t, x){ return t + noiOf(x); }, 0); o.yrMonths = yrRows.length; o.fwdNoi = fwd.reduce(function(t, x){ return t + x.noi; }, 0);
  if(!closed){ o.fwdNoi = rows.slice(0, 12).reduce(function(t, x){ return t + x.noi; }, 0); }
  /* value today: the next twelve months' NOI at the going-in cap rate (Year 1 NOI over the price), less the loan balance for the equity's share */
  var price = num(m.purchasePrice), y1 = rows.slice(0, 12).reduce(function(t, x){ return t + x.noi; }, 0), cap = price && y1 > 0 ? y1 / price : num(s.exitCap);
  o.capUsed = cap; o.value = cap ? o.fwdNoi / cap : null; o.price = price;
  var DM = (r.d && r.d.months) || [], bi = Math.max(0, Math.min(DM.length - 1, monthsIn - 1)); o.loanBal = DM.length ? num((DM[bi] || {}).balance) : num(m.loan);
  if(!closed) o.loanBal = num(m.loan);
  o.equityValue = o.value != null ? o.value - o.loanBal : null;
  /* growth: the underwriting's own rates, a year and compounded over the hold */
  o.rg = num(s.rentGrowth); o.eg = num(s.opexGrowth); o.rgTot = Math.pow(1 + o.rg, H) - 1; o.egTot = Math.pow(1 + o.eg, H) - 1;
  /* what is coming up in the next twelve months */
  var from = closed ? now : close, to = new Date(from.getTime()); to.setUTCMonth(to.getUTCMonth() + 12);
  o.capItems = (Array.isArray(s.capex) ? s.capex : []).filter(function(c){ var d = parseD(c.month); return d && d >= new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1)) && d < to; });
  o.capTot = o.capItems.reduce(function(t, c){ return t + num(c.amount); }, 0);
  o.reserve = rows.filter(function(x){ return x.d > from && x.d <= to; }).reduce(function(t, x){ return t + num(x.reserve); }, 0);
  var rpY = num(s.renoUnitsPerYear), ryr = Math.floor((closed ? monthsIn : 0) / 12) + 1; o.reno = rpY > 0 && ryr >= rs && ryr < rs + ry ? rpY * num(s.renoCapexPerUnit) : 0;
  var RR = Array.isArray(s.rentRoll) ? s.rentRoll : [];
  o.vacant = RR.filter(function(u){ return u.status && u.status !== 'Occupied'; }); o.units = RR.length || num(s.units);
  o.expiring = RR.filter(function(u){ var d = parseD(u.leaseEnd); return u.status === 'Occupied' && d && d >= from && d < to; });
  o.expRent = o.expiring.reduce(function(t, u){ return t + num(u.inPlaceRent); }, 0);
  o.target = s.epTargetIRR != null && s.epTargetIRR !== '' ? num(s.epTargetIRR) : safe(function(){ return num(bkPolicy().targetIRR) || 0.12; }, 0.12);
  return o; }

function kv(rows){ return '<table class="bk-ep-kv"><tbody>' + rows.filter(Boolean).map(function(a){ return '<tr><th scope="row">' + a[0] + '</th><td>' + a[1] + '</td></tr>'; }).join('') + '</tbody></table>'; }
function field(o, k, ph, w){ var v = o.s[k]; if(k === 'epTargetIRR' && v != null && v !== '') v = (num(v) * 100).toFixed(1) + '%'; return '<input type="text" class="bk-ep-in bk-nofield" data-bk-w="free" value="' + esc(v == null ? '' : v) + '" placeholder="' + esc(ph) + '" aria-label="' + esc(ph) + '" onchange="bkEPSet(\'' + esc(o.key).replace(/'/g, '\\\'') + '\',\'' + k + '\',this.value)"' + (w ? ' style="width:' + w + '"' : '') + '>'; }
function card(o){
  var s = o.s, nm = esc(s.name || o.key); if(!o.ok) return '<section class="bk-ep-card"><h3>' + nm + '</h3><div class="note-flag"><span>&#9888;</span><div>The engine could not run this deal: ' + esc(o.err) + '</div></div></section>';
  var m = o.m, gp = num(s.gpShare), lp = 1 - gp, eq = num(m.equity), contrib = num(m.contributed) || eq, dl = function(d){ return d ? d.toLocaleDateString('en-US', { month:'short', year:'numeric', timeZone:'UTC' }) : '—'; };
  var partners = kv([['General partner (GP)', field(o, 'gpEntity', 'GP entity, e.g. Punchlist GP LLC')], ['GP share', P(gp, 1) + ' · ' + M(eq * gp) + ' at closing'], ['Limited partner (LP)', field(o, 'lpEntity', 'LP entity, e.g. Punchlist Fund I LP')], ['LP share', P(lp, 1) + ' · ' + M(eq * lp) + ' at closing'],
    ['Preferred return', P(num(s.pref), 1)], Math.abs(contrib - eq) > 1 ? ['Total equity over the hold', M(contrib) + ' (GP ' + M(contrib * gp) + ', LP ' + M(contrib * lp) + ')'] : null]);
  var goals = kv([['Target levered IRR', field(o, 'epTargetIRR', P(o.target, 1) + ' (policy)', '96px')], ['Projected IRR / multiple', P(m.irr, 1) + ' / ' + X(m.moic) + ' <span class="bk-ep-tag ' + (m.irr >= o.target ? 'ok' : 'bad') + '">' + (m.irr >= o.target ? 'on target' : 'below target') + '</span>'], ['Plan', field(o, 'epPlan', 'e.g. renovate 20 units, refinance in year 3, sell in year 5')]]);
  var life = '<div class="bk-ep-life"><div class="bk-ep-bar"><i style="width:' + (o.lifePct * 100).toFixed(1) + '%"></i></div><div class="bk-ep-lt"><span>Closing ' + dl(o.close) + '</span><b>' + esc(o.stage) + (o.closed ? ' · month ' + o.monthsIn + ' of ' + o.holdM : '') + '</b><span>Sale ' + dl(o.saleDate) + '</span></div></div>';
  var basis = o.closed ? '' : ' <span class="bk-ep-dim">(not yet closed)</span>';
  var returns = kv([['Distributions this year', M(o.ytdDist) + (o.yieldYtd != null && o.closed ? ' · ' + P(o.yieldYtd, 1) + ' of closing equity' : '') + basis], ['Distributions since closing', M(o.lifeDist) + basis], ['Equity contributed to date', M(o.lifeContrib)], o.lifeContrib ? ['Returned to date', X(o.lifeMultiple) + ' of equity in'] : null]);
  var ops = kv([['Rent growth', P(o.rg, 1) + ' a year · ' + P(o.rgTot, 1) + ' over ' + o.H + ' years'], ['Expense growth', P(o.eg, 1) + ' a year · ' + P(o.egTot, 1) + ' over ' + o.H + ' years'],
    ['NOI this year to date', o.closed ? M(o.ytdNoi) + ' <span class="bk-ep-dim">' + (!o.ytdActual ? 'projected' : o.ytdActual >= o.ytdMonths ? 'actual' : o.ytdActual + ' months actual, ' + (o.ytdMonths - o.ytdActual) + ' projected') + '</span>' : '— <span class="bk-ep-dim">not yet closed</span>'],
    ['NOI this calendar year', o.closed ? M(o.yrNoi) + ' <span class="bk-ep-dim">' + (o.ytdActual ? 'actual to date, then projected' : 'projected') + (o.yrMonths < 12 ? ', ' + o.yrMonths + ' months owned' : '') + '</span>' : '—'],
    ['NOI, next 12 months', M(o.fwdNoi) + ' <span class="bk-ep-dim">' + (o.closed ? 'projected' : 'first 12 months after closing') + '</span>']]);
  var val = kv([['Current value', M(o.value) + ' <span class="bk-ep-dim">next-12-month NOI at ' + P(o.capUsed, 2) + ' (going-in cap)</span>'], ['Against the purchase price', o.price && o.value != null ? (o.value >= o.price ? '+' : '') + P(o.value / o.price - 1, 1) + ' (' + M(o.value - o.price) + ')' : '—'], ['Loan balance', M(o.loanBal)], ['Equity value', M(o.equityValue) + (eq ? ' · ' + X(o.equityValue / eq) + ' of closing equity' : '')]]);
  var up = kv([['Capital items, next 12 months', o.capItems.length ? M(o.capTot) + ' <span class="bk-ep-dim">' + o.capItems.map(function(c){ return esc(c.name || 'item') + ' ' + esc(c.month || ''); }).join(', ') + '</span>' : 'None scheduled'],
    o.reno ? ['Renovation program this year', M(o.reno) + ' <span class="bk-ep-dim">' + num(s.renoUnitsPerYear) + ' units at ' + M(num(s.renoCapexPerUnit)) + '</span>'] : null, ['Reserves funded, next 12 months', M(o.reserve)],
    ['Vacant units now', (Array.isArray(s.rentRoll) && s.rentRoll.length) ? o.vacant.length + ' of ' + o.units + (o.vacant.length ? ' <span class="bk-ep-dim">' + o.vacant.slice(0, 6).map(function(u){ return esc(u.unitId || ''); }).join(', ') + (o.vacant.length > 6 ? ', …' : '') + '</span>' : '') : '<span class="bk-ep-dim">no rent roll on this deal</span>'],
    ['Leases ending, next 12 months', (Array.isArray(s.rentRoll) && s.rentRoll.length) ? o.expiring.length + (o.expiring.length ? ' · ' + M(o.expRent) + ' a month in place' : '') : '<span class="bk-ep-dim">no rent roll on this deal</span>']]);
  return '<section class="bk-ep-card"><div class="bk-ep-h"><h3>' + nm + '</h3><span class="bk-ep-dim">' + esc([s.dealType, s.propertyType, s.location].filter(Boolean).join(' · ')) + '</span></div>' + life
    + '<div class="bk-ep-g"><div><h4>Partners</h4>' + partners + '</div><div><h4>Goals</h4>' + goals + '<h4>Returns</h4>' + returns + '</div><div><h4>Operations</h4>' + ops + '</div><div><h4>Value</h4>' + val + '<h4>Coming up</h4>' + up + '</div></div></section>'; }

function render(){
  var cur = safe(function(){ return bkLoad(); }, {}) || {}, EQL = /develop/i.test(String(cur.dealType || '')) ? 'Initial funding equity' : 'Closing equity';   /* the app names this measure by the active deal's type (src/028) */
  var saved = safe(function(){ return bkPortfolioLoad(); }, []), now = new Date(), V = saved.map(function(s){ return dealView(s, now); }), ok = V.filter(function(o){ return o.ok; });
  var sum = function(k){ return ok.reduce(function(t, o){ return t + num(o[k]); }, 0); }, eqT = ok.reduce(function(t, o){ return t + num(o.m.equity); }, 0);
  var head = '<div class="tbl-wrap"><table class="fin bk-ep-sum"><caption>Equity partners by deal (' + saved.length + ')</caption><thead><tr><th class="rowlabel-h">Deal</th><th>Stage</th><th>GP / LP</th><th>' + EQL + '</th><th>Distributions YTD</th><th>Current value</th><th>NOI this year</th></tr></thead><tbody>'
    + (V.length ? V.map(function(o){ var s = o.s; if(!o.ok) return '<tr><td class="rowlabel">' + esc(s.name || o.key) + '</td><td colspan="6">Engine error</td></tr>'; var gp = num(s.gpShare);
      return '<tr><td class="rowlabel"><a href="#ep-' + esc(o.key) + '">' + esc(s.name || o.key) + '</a><span class="bk-sub bk-ep-ent">' + (s.gpEntity || s.lpEntity ? esc(s.gpEntity || 'GP not named') + ' · ' + esc(s.lpEntity || 'LP not named') : 'Partners not named yet') + '</span></td><td>' + esc(o.stage) + '</td><td>' + P(gp, 0) + ' / ' + P(1 - gp, 0) + '</td><td>' + M(o.m.equity) + '</td><td>' + M(o.ytdDist) + '</td><td>' + M(o.value) + '</td><td>' + (o.closed ? M(o.yrNoi) : '—') + '</td></tr>'; }).join('')
      + '<tr class="grandtotal"><td class="rowlabel">Portfolio</td><td></td><td></td><td>' + M(eqT) + '</td><td>' + M(sum('ytdDist')) + '</td><td>' + M(sum('value')) + '</td><td>' + M(ok.filter(function(o){ return o.closed; }).reduce(function(t, o){ return t + o.yrNoi; }, 0)) + '</td></tr>'
      : '<tr><td class="rowlabel" colspan="7">No deals saved yet. Save a deal from the Portfolio page.</td></tr>') + '</tbody></table></div>';
  var cards = V.map(function(o){ return '<div id="ep-' + esc(o.key) + '">' + card(o) + '</div>'; }).join('');
  var note = '<div class="note-flag"><span>&#9432;</span><div>Each deal is read from its own saved snapshot and run through the engine. Returns, NOI and value are the projection until actuals are entered on Budget vs Actual, which then replace the projected months. Entities, the target and the plan are typed here and saved with the deal.</div></div>';
  var sidebar = sidebarShell('<div class="card"><div class="card-head">Partners</div><div class="metric-list"><div class="metric-row"><span class="k">Deals</span><span class="v">' + saved.length + '</span></div><div class="metric-row"><span class="k">' + EQL + ', all deals</span><span class="v">' + M(eqT) + '</span></div><div class="metric-row"><span class="k">Distributions YTD, all deals</span><span class="v">' + M(sum('ytdDist')) + '</span></div><div class="metric-row"><span class="k">Equity value, all deals</span><span class="v">' + M(sum('equityValue')) + '</span></div></div></div>' + modelInfoCard('<div class="metric-row"><span class="k">Tab Group</span><span class="v">Portfolio Database</span></div>') + colorKeyCard());
  return { title:'Equity Partners', crumbs:'Portfolio Database', desc:'Each deal\'s partners, goals, stage, returns, growth, value, NOI and what is coming up.', meta:{ Deals:saved.length, Currency:'USD' }, main:head + note + cards, sidebar:sidebar }; }
if(typeof window.bkRegisterRenderer === 'function') window.bkRegisterRenderer('Equity Partners', render); else RENDERERS['Equity Partners'] = render;
})();
