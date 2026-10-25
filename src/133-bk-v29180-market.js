
/* V29.18.0 - MARKET BENCHMARKS. Published market averages beside the deal's own assumptions. Reference only: nothing here feeds the engine,
   and every range is editable (stored in this browser) because published figures are dated, regional and definitional (cap-rate sources differ by 50-100 bps). */
(function(){
'use strict';
if(typeof RENDERERS === 'undefined') return;
var KEY = 'bk.market.v1';
/* id, label, low, high, unit ('pct'|'usd'|'x'), as-of, source, note, how to read the deal's value */
var DEFAULTS = [
  { id:'exitCap', label:'Exit cap rate', low:0.050, high:0.065, unit:'pct', asOf:'Q2-Q3 2026', src:'Lev (Jul 2026): national multifamily 5.7%, flat seven quarters; Arbor Q3 2026: all multifamily 5.6%, small multifamily 6.0% (Q2)', url:'https://www.lev.com/blog/multifamily-cap-rates-2026', note:'Transaction cap rates. NCREIF appraisal-based rates run lower (about 4.9% in Q3 2025), so an exit cap below this band deserves a reason.' },
  { id:'goingIn', label:'Going-in cap rate (Year-1 NOI after reserves / price)', low:0.050, high:0.065, unit:'pct', asOf:'Q2-Q3 2026', src:'Same sources as exit cap', url:'https://arbor.com/wp-content/uploads/2026/08/Arbor_Small-Multifamily-Investment-Trends-Report_2026_Q3.pdf', note:'Pricing well inside the band means paying a premium for growth or a lower-risk market.' },
  { id:'capSpread', label:'Exit cap minus going-in cap (bps)', low:0, high:75, unit:'bps', asOf:'Underwriting practice', src:'Institutional convention: exit cap at or above going-in, typically +25 to +50 bps', url:'', note:'A negative spread bakes cap-rate compression into the return.' },
  { id:'opexUnit', label:'Operating expenses per unit per year', low:6500, high:10500, unit:'usd', asOf:'2024 same-store', src:'NAA same-store sample: $8,657 per unit, +2.2% y/y (via Baselane); Yardi Matrix about $8,700', url:'https://www.baselane.com/resources/rental-property-operating-expense-statistics', note:'Varies by market, vintage and whether taxes are included. Texas and Florida run higher on taxes and insurance.' },
  { id:'expRatio', label:'Expense ratio (opex / effective gross income)', low:0.35, high:0.50, unit:'pct', asOf:'Rule of thumb', src:'Commonly cited 35-45% for stabilised multifamily; property-management vendor sources, not a survey', url:'https://lula.life/articles/rental-property-maintenance-costs-guide', note:'Treat as a sanity check only. Below 35% usually means expenses are missing.' },
  { id:'opexGrowth', label:'Operating expense growth', low:0.025, high:0.045, unit:'pct', asOf:'2025', src:'RealPage: expense growth at its lowest since early 2021, expenses about 39% above pre-pandemic; insurance growth about 7% annualised in Q1 2025 after 33.5% a year earlier', url:'https://www.realpage.com/analytics/opex-moderation-2q25/', note:'Underwriting opex growth below rent growth builds in margin expansion.' },
  { id:'rate', label:'Acquisition loan coupon', low:0.050, high:0.065, unit:'pct', asOf:'Feb 2026', src:'Northmarq agency grid: 10-yr fixed about 5.0-5.4% across 55-80% LTV; spreads about 95-140 bps over the 10-yr Treasury. Small-balance and bank loans price wider.', url:'https://www.northmarq.com/insights/rates-spreads', note:'Agency pricing. Bridge, CMBS and bank loans can be 100-300 bps wider.' },
  { id:'ltv', label:'Loan-to-value', low:0.55, high:0.80, unit:'pct', asOf:'Feb 2026', src:'Northmarq agency grid: 55% to 80% LTV by product', url:'https://www.northmarq.com/insights/rates-spreads', note:'Above about 75% generally needs a lower coupon test or a lower DSCR floor.' },
  { id:'dscr', label:'Debt service coverage (Year-1)', low:1.25, high:1.55, unit:'x', asOf:'Feb 2026', src:'Northmarq agency grid: 1.25x at 80% LTV up to 1.55x at 55% LTV', url:'https://www.northmarq.com/insights/rates-spreads', note:'FHA 221(d)(4) allows about 1.15x at 87% LTV.' }
];
function saved(){ try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch(e){ return {}; } }
function persist(o){ try { localStorage.setItem(KEY, JSON.stringify(o)); } catch(e){} }
function rows(){ var o = saved(); return DEFAULTS.map(function(d){ var u = o[d.id] || {}; return Object.assign({}, d, { low:u.low != null ? u.low : d.low, high:u.high != null ? u.high : d.high, edited:u.low != null || u.high != null }); }); }
window.bkMarketSet = function(id, side, v){ var o = saved(); o[id] = o[id] || {}; var d = DEFAULTS.filter(function(x){ return x.id === id; })[0]; if(!d) return;
  o[id][side] = d.unit === 'pct' ? v / 100 : v; persist(o); if(typeof showSheet === 'function') showSheet('Market Benchmarks'); };
window.bkMarketReset = function(){ persist({}); if(typeof showSheet === 'function') showSheet('Market Benchmarks'); };
/* the deal's own value for each benchmark; null where it does not apply */
window.bkMarketDeal = function(){
  var s = bkLoad(); if(!s) return null; var out = {};
  var mf = /multifamily|apartment|residential|student|senior|garden|mid-rise|high-rise|townhome/i.test(String(s.propertyType || 'Multifamily'));
  if(s.dealType === 'Development' || !mf) return { applies:false, reason: s.dealType === 'Development' ? 'These are stabilised-acquisition benchmarks; this is a development deal.' : 'These benchmarks are for multifamily; this deal is ' + s.propertyType + '.' };
  var c = null, price = Number(s.purchasePrice) || 0, units = Number(s.units) || 0, y1 = null;
  try { c = bkCalc(); } catch(e){}
  try { y1 = bkAnnualCF().arr[0].after; } catch(e){}
  out.exitCap = Number(s.exitCap) || null;
  out.goingIn = price > 0 && y1 != null ? y1 / price : null;
  out.capSpread = out.exitCap != null && out.goingIn != null ? (out.exitCap - out.goingIn) * 10000 : null;
  out.opexUnit = c && units > 0 ? c.total / units : null;
  out.expRatio = c ? c.expenseRatio : null;
  out.opexGrowth = s.opexGrowth != null ? Number(s.opexGrowth) : null;
  var d = null; try { d = bkDebt(); } catch(e){}
  out.rate = Number(s.acqRate) || null;
  out.ltv = d && d.loan && price > 0 ? d.loan / price : null;
  out.dscr = d && d.dscr ? d.dscr : null;
  out.applies = true; return out;
};
function fmt(v, u){ if(v == null || !isFinite(v)) return 'n/a'; return u === 'pct' ? (v * 100).toFixed(2) + '%' : u === 'usd' ? '$' + Math.round(v).toLocaleString('en-US') : u === 'bps' ? Math.round(v) + ' bps' : v.toFixed(2) + 'x'; }
function status(r, v){ if(v == null || !isFinite(v)) return { cls:'', t:'N/A', d:0 };
  var lo = r.low, hi = r.high; if(v < lo) return { cls:'warn', t:'BELOW RANGE', d:v - lo }; if(v > hi) return { cls:'warn', t:'ABOVE RANGE', d:v - hi }; return { cls:'pass', t:'IN RANGE', d:0 }; }
window.bkMarketCompare = function(){ var d = window.bkMarketDeal(); if(!d || !d.applies) return d; return Object.assign({ applies:true }, { rows: rows().map(function(r){ var v = d[r.id], st = status(r, v); return { id:r.id, label:r.label, value:v, low:r.low, high:r.high, status:st.t, gap:st.d }; }) }); };
function inp(id, side, r){ var v = r[side], shown = r.unit === 'pct' ? (v * 100).toFixed(2).replace(/\.?0+$/, '') : r.unit === 'usd' ? Number(v).toLocaleString('en-US') : String(v);
  return '<input type="text" value="' + shown + '" style="width:72px!important;min-width:0;text-align:left" onchange="bkMarketSet(\'' + id + '\',\'' + side + '\',parseFloat(String(this.value).replace(/[$,]/g,\'\'))||0)">' + (r.unit === 'pct' ? '<span style="font-size:11px"> %</span>' : r.unit === 'bps' ? '<span style="font-size:11px"> bps</span>' : r.unit === 'x' ? '<span style="font-size:11px"> x</span>' : ''); }
function render(){
  var s = bkLoad(), d = window.bkMarketDeal();
  var main;
  if(!d || !d.applies){ main = '<div class="note-flag"><span>&#9432;</span><div>' + ((d && d.reason) || 'Open a deal to compare it with the market.') + '</div></div>'; }
  else {
    var R = rows(), body = R.map(function(r){ var v = d[r.id], st = status(r, v);
      return '<tr><td class="rowlabel">' + r.label + (r.edited ? ' <span style="font-size:10px;color:#7a8da1">(edited)</span>' : '') + '</td><td><b>' + fmt(v, r.unit) + '</b></td><td>' + inp(r.id, 'low', r) + '</td><td>' + inp(r.id, 'high', r) + '</td><td><span class="status-chip ' + st.cls + '">' + st.t + '</span></td></tr>'; }).join('');
    var out = R.filter(function(r){ return status(r, d[r.id]).cls === 'warn'; });
    var summary = out.length ? '<div class="note-flag" style="margin-top:0"><span>&#9888;</span><div><b>' + out.length + ' of ' + R.length + ' assumptions sit outside the published range:</b> ' + out.map(function(r){ return r.label.replace(/ \(.*\)/, ''); }).join('; ') + '. That is not an error - it is where a reviewer will push, so have the reason ready.</div></div>'
      : '<div class="note-flag" style="margin-top:0"><span>&#10003;</span><div>Every assumption sits inside the published range.</div></div>';
    var src = R.map(function(r){ return '<tr><td class="rowlabel">' + r.label.replace(/ \(.*\)/, '') + '</td><td>' + r.asOf + '</td><td style="text-align:left;white-space:normal;min-width:260px">' + (r.url ? '<a href="' + r.url + '" target="_blank" rel="noopener">' + r.src + '</a>' : r.src) + '<div style="font-size:11px;color:#7a8da1;margin-top:4px">' + r.note + '</div></td></tr>'; }).join('');
    main = summary
      + '<div class="tbl-wrap" style="margin-top:16px"><table class="fin"><caption>Deal vs Published Market Range</caption><thead><tr><th class="rowlabel-h">Assumption</th><th>This deal</th><th>Range low</th><th>Range high</th><th>Position</th></tr></thead><tbody>' + body + '</tbody></table></div>'
      + '<div style="margin-top:10px"><button type="button" class="status-chip" onclick="bkMarketReset()">RESET RANGES TO PUBLISHED</button></div>'
      + '<div class="tbl-wrap" style="margin-top:16px"><table class="fin"><caption>Sources and Caveats</caption><thead><tr><th class="rowlabel-h">Benchmark</th><th>As of</th><th style="text-align:left">Source</th></tr></thead><tbody>' + src + '</tbody></table></div>'
      + '<div class="note-flag" style="margin-top:12px"><span>&#9432;</span><div>Ranges are a reading of published reports, not a data feed, and they are national: a Class B garden deal in a tertiary market can sit outside a national band and be right. Edit any range to your own market; edits stay in this browser. Nothing on this sheet changes the underwriting.</div></div>';
  }
  return { title:'Market Benchmarks', crumbs:'Inputs', desc:'Your assumptions beside published multifamily cap rates, expenses and agency debt terms.', meta:{ Property:s ? s.name : '', Basis:'Published, national' }, sidebar:'', main:main };
}
var g = function(){ if(typeof window.bkHasActiveDeal === 'function' && !window.bkHasActiveDeal() && typeof window.bkEmptyState === 'function') return window.bkEmptyState('Market Benchmarks'); return render(); };
if(typeof window.bkRegisterRenderer === 'function') window.bkRegisterRenderer('Market Benchmarks', g); else RENDERERS['Market Benchmarks'] = g;
})();
