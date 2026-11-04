
/* Step-by-step guide: one section at a time, essentials only, nothing written until you confirm, skipped steps remembered. Toggle in the header. */
(function(){
'use strict';
if(typeof RENDERERS === 'undefined' || typeof window.bkLoad !== 'function') return;
function esc(v){ return String(v == null ? '' : v).replace(/[&<>"]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
function safe(f, d){ try { var v = f(); return v === undefined ? d : v; } catch(e){ return d; } }
function active(){ return typeof window.bkHasActiveDeal !== 'function' || window.bkHasActiveDeal(); }
var PREF = 'bkcapital.guide.on';
function prefOn(){ try { return localStorage.getItem(PREF) === '1'; } catch(e){ return false; } }
function setPref(v){ try { localStorage.setItem(PREF, v ? '1' : '0'); } catch(e){} }
var st = { step:null, draft:{}, screen:'', checked:{} };

/* ------------------------------------------------------------ what each step asks (essentials only; "add detail" opens the full sheet) */
var Q = { pct:'pct', money:'money', int:'int', num:'num', text:'text', bool:'bool' };
function f(k, label, t, o){ return Object.assign({ k:k, label:label, t:t }, o || {}); }
var INC = { id:'income', title:'Rents and other income', why:'Income is what everything else rests on. Use the rent the units earn today; add the upside later, on purpose.', sheet:'Deal Underwrite', fields:[
  f('avgRent', 'Average rent per unit, per month', 'money', { req:1, help:'Total monthly scheduled rent divided by units.' }),
  f('otherIncomePerUnit', 'Other income per unit, per year', 'money', { help:'Laundry, parking, fees, utility bill-back.' }),
  f('vacancy', 'Vacancy', 'pct', { req:1, sug:function(){ return { v:0.05, why:'Stabilized multifamily is usually underwritten at 5%. Use more if the building is not full.' }; } }) ] };
var EXP = function(dev){ return { id:'expenses', title:'Operating expenses', why:'Use the last twelve months where you have them. A missing line (management, repairs, reserves) is the most common way an NOI looks better than it is.', sheet:'Deal Underwrite', fields:[
  f('taxes', 'Real estate taxes, per year', 'money', { req:1 }), f('insurance', 'Insurance, per year', 'money', { req:1 }), f('utilities', 'Utilities the owner pays, per year', 'money'), f('rm', 'Repairs and maintenance, per year', 'money', { req:1 }),
  f('mgmtPct', 'Management fee, % of income', 'pct', { req:1, sug:function(){ return { v:0.03, why:'Third-party managers charge about 3% to 5% of collected income. Include a fee even if you self-manage.' }; } }),
  f('payroll', 'On-site payroll, per year', 'money'), f('contract', 'Contract services (landscaping, snow, pest), per year', 'money'), f('ga', 'General, admin and other, per year', 'money'),
  f('reserves', 'Replacement reserves, per year', 'money', { sug:function(s){ var u = Number(s.units) || 0; return u ? { v:u * 300, why:'Reserves are usually $250 to $300 a unit a year (' + u + ' units).' } : null; } }) ] }; };
var EXIT = { id:'exit', title:'Hold and exit', why:'How long you keep it and what you assume it sells for. The exit cap rate moves the answer more than anything else here.', sheet:'Deal Underwrite', fields:[
  f('holdYears', 'Hold period, years', 'int', { req:1, sug:function(){ return { v:5, why:'Five years is the usual base case.' }; } }),
  f('exitCap', 'Exit cap rate', 'pct', { req:1, sug:function(s){ var c = safe(function(){ return bkCalc(); }, {}), p = Number(s.purchasePrice) || 0; return c.noi && p ? { v:Math.round((c.noi / p + 0.0025) * 10000) / 10000, why:'The going-in cap rate (' + (c.noi / p * 100).toFixed(2) + '%) plus 0.25%, so the sale is not assumed to be better than the purchase.' } : { v:0.06, why:'No price or income yet; 6% is a placeholder.' }; } }),
  f('rentGrowth', 'Annual rent growth', 'pct', { sug:function(){ return { v:0.03, why:'3% is a common long-run assumption; use less in a soft market.' }; } }),
  f('opexGrowth', 'Annual expense growth', 'pct', { sug:function(){ return { v:0.03, why:'Expenses usually grow at about 3% a year.' }; } }),
  f('saleCostPct', 'Cost of sale, % of price', 'pct', { sug:function(){ return { v:0.02, why:'Broker and closing costs on a sale are about 2%.' }; } }) ] };
var ACQ = [
  { id:'property', title:'The property', why:'The basics that size everything else.', sheet:'Deal Underwrite', fields:[ f('name', 'Name', 'text', { req:1 }), f('location', 'City, state', 'text'), f('units', 'Units', 'int', { req:1 }), f('gsf', 'Building area, SF', 'int') ] },
  { id:'price', title:'Price and closing', why:'What you pay and what it costs to close.', sheet:'Deal Underwrite', fields:[ f('purchasePrice', 'Purchase price', 'money', { req:1 }), f('closingCostsPct', 'Closing costs, % of price', 'pct', { req:1, sug:function(){ return { v:0.02, why:'Legal, title, lender fees and inspections are typically 1.5% to 3%.' }; } }), f('closing', 'Closing date', 'text', { help:'For example 3/1/2027.' }) ] },
  INC, EXP(false),
  { id:'debt', title:'Financing', why:'The loan changes the return and the risk. Skip it and the returns shown are all-cash.', sheet:'Debt', fields:[ f('debtEnabled', 'Use acquisition debt', 'bool'), f('acqLTV', 'Loan-to-value, max', 'pct', { req:1, sug:function(){ return { v:0.65, why:'Most lenders cap multifamily at 65% to 75%; 65% is a safe starting point.' }; } }), f('acqRate', 'Interest rate', 'pct', { req:1, sug:function(){ return { v:0.0675, why:'A placeholder until you have a lender quote.' }; } }), f('acqAmort', 'Amortization, years', 'int', { sug:function(){ return { v:30, why:'30 years is standard.' }; } }), f('acqIO', 'Interest-only years', 'num', { help:'0 if none.' }), f('acqOrigFee', 'Origination fee, %', 'pct', { sug:function(){ return { v:0.01, why:'1% is typical.' }; } }) ] },
  EXIT ];
var DEVS = [
  { id:'property', title:'The project', why:'What is being built.', sheet:'Deal Underwrite', fields:[ f('name', 'Name', 'text', { req:1 }), f('location', 'City, state', 'text'), f('units', 'Residential units', 'int', { req:1 }), f('gsf', 'Gross building area, SF', 'int') ] },
  { id:'land', title:'Land and budget', why:'The two big costs. Land is the price; the construction budget is hard and soft costs together.', sheet:'Deal Underwrite', fields:[ f('purchasePrice', 'Land price', 'money', { req:1 }), f('sourceConstruction', 'Construction budget (hard + soft)', 'money', { req:1 }), f('closing', 'Closing date', 'text'),
    f('predevMonths', 'Pre-development, months', 'int', { sug:function(){ return { v:6, why:'Permits and bidding usually take 3 to 9 months.' }; } }), f('constructionMonths', 'Construction, months', 'int', { req:1, sug:function(){ return { v:18, why:'Mid-rise multifamily usually builds in 16 to 24 months.' }; } }), f('leaseupMonths', 'Lease-up, months', 'int', { sug:function(){ return { v:12, why:'New buildings usually lease up in 10 to 16 months.' }; } }) ] },
  INC, EXP(true),
  { id:'debt', title:'Financing', why:'A construction loan, then a permanent loan once the building is stabilized.', sheet:'Debt', fields:[ f('conLTC', 'Construction loan, % of cost', 'pct', { req:1, sug:function(){ return { v:0.65, why:'Construction lenders usually lend 60% to 70% of cost.' }; } }), f('conRate', 'Construction loan rate', 'pct', { req:1, sug:function(){ return { v:0.075, why:'A placeholder until you have a quote.' }; } }), f('permRate', 'Permanent loan rate', 'pct', { sug:function(){ return { v:0.0675, why:'A placeholder until you have a quote.' }; } }), f('permAmort', 'Permanent amortization, years', 'int', { sug:function(){ return { v:30, why:'30 years is standard.' }; } }) ] },
  EXIT ];
/* the steps come from the analysis registry (src/139d): the deal's own analysis decides them. The lists above are the fallback if the registry is not loaded. */
function fromRegistry(s){ var R = window.BKReg; if(!R) return null; var a = R.of(s), wf = a && a.live ? R.workflow(a.id) : null; if(!wf || !wf.length) return null;
  return wf.map(function(st){ return { id:st.id, title:st.title, why:st.why, sheet:st.sheet, skippable:!!st.skippable, fields:(st.fields || []).filter(function(e){ var d = R.field(e.k); return d && d.kind !== 'derived' && d.kind !== 'table' && R.requirement(e, s) !== 'na'; }).map(function(e){ var d = R.field(e.k), o = { k:e.k, label:e.label || d.label, t:d.kind === 'choice' ? 'text' : d.kind };
      if(R.requirement(e, s) === 'required') o.req = 1; var h = e.help || d.help; if(h) o.help = h; var sg = e.sug || d.sug; if(sg) o.sug = sg; return o; }) }; }); }
function sections(s){ s = s || bkLoad(); return fromRegistry(s) || (/develop/i.test(String(s.dealType || '')) ? DEVS : ACQ); }
window.bkGuideSections = function(s){ return sections(s); };

/* ------------------------------------------------------------ values */
function gstate(s){ var g = (s && s._guide) || {}; return { done:g.done || {}, skipped:g.skipped || {}, from:g.from || null, assumed:g.assumed || [], confirmed:g.confirmed || {} }; }
function putG(g){ var s = bkLoad(); s._guide = g; bkSave(s); }
function fmt(fl, v){ if(fl.t === 'bool') return !!v; if(v == null || v === '' || (fl.t !== 'text' && Number(v) === 0)) return ''; if(fl.t === 'pct') return (Math.round(Number(v) * 10000) / 100).toString(); if(fl.t === 'money' || fl.t === 'int') return isFinite(Number(v)) ? Math.round(Number(v)).toLocaleString('en-US') : String(v); return String(v); }
function parse(fl, raw){ raw = String(raw).trim(); if(fl.t === 'text') return raw; var n = parseFloat(raw.replace(/[^0-9.\-]/g, '')); if(!isFinite(n)) return null; return fl.t === 'pct' ? n / 100 : n; }
var SRC = { purchasePrice:'price', units:'units', gsf:'sf', avgRent:'unitMix', name:'name', location:'name' };
function srcPage(g, k){ if(!g.from || !g.from.pages) return null; var key = SRC[k] || 'income'; return g.from.pages[key] || g.from.pages.income || null; }
function money0(n){ return '$' + Math.round(n).toLocaleString('en-US'); }
function cur(s, fl){ return Object.prototype.hasOwnProperty.call(st.draft, fl.k) ? st.draft[fl.k] : s[fl.k]; }
function missing(sec, s){ var rr = typeof window.bkRequiredRows === 'function' ? window.bkRequiredRows().core : {}; return sec.fields.filter(function(fl){ if(Object.prototype.hasOwnProperty.call(rr, fl.k)) return true; if(!fl.req) return false; var v = s[fl.k]; return fl.t === 'text' ? !String(v || '').trim() : !(Number(v) > 0); }); }
function status(sec, s, g){ if(g.skipped[sec.id]) return 'skipped'; var m = missing(sec, s).length; if(g.done[sec.id]) return m ? 'partial' : 'done'; return m ? 'todo' : 'filled'; }


/* ------------------------------------------------------------ reading the deal as it stands: advice, impact, one-line summaries */
function pc(v, d){ return v == null || !isFinite(v) ? '—' : (v * 100).toFixed(d == null ? 1 : d) + '%'; }
function irrWith(ov){ return safe(function(){ return window.bkRunWith(ov || {}, function(){ var m = bkMonthlyReturns(); return { irr:m.irr, moic:m.moic }; }); }, null); }
function advice(s){
  var out = [], dev = /develop/i.test(String(s.dealType || '')), units = Number(s.units) || 0, price = Number(s.purchasePrice) || 0, c = safe(function(){ return bkCalc(); }, {}) || {}, noi = Number(c.noi) || 0, egi = Number(c.egi) || 0;
  function add(sec, lvl, text, fix){ out.push({ sec:sec, lvl:lvl, text:text, fix:fix || null }); }
  if(Number(s.vacancy) < 0.03) add('income', 'warn', 'Vacancy is ' + pc(Number(s.vacancy), 1) + '. Even full buildings turn over; underwriting at 5% is the usual cushion.', { k:'vacancy', v:0.05, label:'Propose 5%' });
  if(!(Number(s.mgmtPct) > 0) && egi) add('expenses', 'warn', 'There is no management fee. A buyer or lender will add 3% to 5% of income, even if you self-manage.', { k:'mgmtPct', v:0.03, label:'Propose 3%' });
  if(!(Number(s.reserves) > 0) && units) add('expenses', 'warn', 'No replacement reserves. They are usually $250 to $300 a unit a year (' + money0(units * 300) + ' for ' + units + ' units).', { k:'reserves', v:units * 300, label:'Propose ' + money0(units * 300) });
  if(!(Number(s.insurance) > 0)) add('expenses', 'warn', 'Insurance is blank; it is a real cost on every building.');
  if(egi && noi){ var ratio = 1 - noi / egi; if(ratio < 0.33) add('expenses', 'warn', 'Expenses are only ' + pc(ratio, 0) + ' of income. Multifamily usually runs 35% to 50%; a low ratio often means a missing line.'); else if(ratio > 0.55) add('expenses', 'info', 'Expenses are ' + pc(ratio, 0) + ' of income, on the heavy side. Check taxes and utilities.'); }
  if(price && Number(s.taxes) > 0){ var tr = Number(s.taxes) / price; if(tr < 0.006) add('expenses', 'info', 'Taxes are ' + pc(tr, 2) + ' of price. Many towns reassess at sale; check what the bill becomes at your price.'); }
  if(price && noi && Number(s.exitCap) > 0){ var going = noi / price; if(Number(s.exitCap) < going - 0.0005) add('exit', 'warn', 'You sell at a ' + pc(Number(s.exitCap), 2) + ' cap but buy at ' + pc(going, 2) + '. That adds value on paper. Selling at the going-in cap or a little higher is the cautious case.', { k:'exitCap', v:Math.round((going + 0.0025) * 10000) / 10000, label:'Propose ' + pc(going + 0.0025, 2) }); }
  if(Number(s.holdYears) > 0 && (Number(s.holdYears) < 3 || Number(s.holdYears) > 10)) add('exit', 'info', 'A hold of ' + s.holdYears + ' years is unusual. Five to seven is typical.');
  if(Number(s.rentGrowth) > 0.04) add('exit', 'warn', 'Rent growth of ' + pc(Number(s.rentGrowth), 1) + ' a year is aggressive over a full hold.', { k:'rentGrowth', v:0.03, label:'Propose 3%' });
  if(Number(s.rentGrowth) > 0 && Number(s.opexGrowth) > 0 && Number(s.opexGrowth) < Number(s.rentGrowth) - 0.015) add('exit', 'info', 'Expenses grow ' + pc(Number(s.opexGrowth), 1) + ' against rents at ' + pc(Number(s.rentGrowth), 1) + '. Costs rarely grow slower than rents for long.');
  if(!(Number(s.closingCostsPct) > 0)) add('price', 'warn', 'Closing costs are zero. Legal, title and lender fees are typically 1.5% to 3% of price.', { k:'closingCostsPct', v:0.02, label:'Propose 2%' });
  if(!dev && s.debtEnabled !== false){
    var d = safe(function(){ return bkDebt(); }, null);
    if(d && d.loan){ if(d.binding && d.binding !== 'LTV' && Number(s.acqLTV) > 0 && d.byLTV && d.loan < d.byLTV * 0.97) add('debt', 'info', 'The loan will be ' + money0(d.loan) + ', sized by ' + (d.binding === 'DSCR' ? 'the coverage requirement' : d.binding === 'LTC' ? 'cost' : d.binding) + ', not the ' + pc(Number(s.acqLTV), 0) + ' loan-to-value you set (' + money0(d.byLTV) + ').');
      if(d.dscr && d.dscr < 1.2) add('debt', 'warn', 'Year-1 coverage is ' + d.dscr.toFixed(2) + 'x. Most lenders want 1.20x to 1.25x.'); }
    var mk = safe(function(){ return bkMarketCompare(); }, null); if(mk && mk.rows){ mk.rows.forEach(function(r){ if(r.status !== 'IN RANGE' && (r.id === 'rate' || r.id === 'ltv')) add('debt', 'info', r.label + ' is ' + (r.id === 'ltv' ? pc(r.value, 0) : pc(r.value, 2)) + ', ' + r.status.toLowerCase() + ' (' + (r.id === 'ltv' ? pc(r.low, 0) + ' to ' + pc(r.high, 0) : pc(r.low, 2) + ' to ' + pc(r.high, 2)) + ').'); if(r.status !== 'IN RANGE' && r.id === 'opexUnit') add('expenses', 'info', 'Operating expenses per unit are ' + money0(r.value) + ', ' + r.status.toLowerCase() + ' (' + money0(r.low) + ' to ' + money0(r.high) + ').'); }); }
  }
  if(dev){ var cm = Number(s.constructionMonths) || 0; if(cm && (cm < 12 || cm > 30)) add('land', 'info', 'A construction period of ' + cm + ' months is outside the usual 12 to 30.'); var gate = safe(function(){ return bkDealGate(); }, null); var sp = gate && gate.rows ? gate.rows.filter(function(r){ return r.id === 'devSpread' && r.applicable; })[0] : null; if(sp && sp.value != null && sp.value < sp.threshold) add('exit', 'warn', 'The yield on cost is only ' + Math.round(sp.value) + ' bps over the exit cap; the house wants ' + Math.round(sp.threshold) + '. Development risk needs a bigger cushion than that.'); }
  var gt = safe(function(){ return bkDealGate(); }, null); if(gt && /DECLINE|HOLD/i.test(gt.verdict || '') && gt.action) add('review', 'warn', 'The credit gate says decline: ' + gt.action);
  return out;
}
function secOf(secs, id){ return secs.filter(function(x){ return x.id === id; })[0]; }
function readLine(id, s){
  var c = safe(function(){ return bkCalc(); }, {}) || {}, p = Number(s.purchasePrice) || 0, u = Number(s.units) || 0, dev = /develop/i.test(String(s.dealType || ''));
  if(id === 'property') return [s.name, s.location, u ? u + ' units' : '', Number(s.gsf) ? Number(s.gsf).toLocaleString('en-US') + ' SF' : ''].filter(Boolean).join(' · ') || 'Nothing entered yet';
  if(id === 'price') return p ? money0(p) + (u ? ' (' + money0(p / u) + ' a unit)' : '') + ', closing costs ' + pc(Number(s.closingCostsPct), 1) : 'No price yet';
  if(id === 'land') return p ? 'Land ' + money0(p) + ', construction ' + (Number(s.sourceConstruction) ? money0(Number(s.sourceConstruction)) : 'budget not set') + ', ' + (s.constructionMonths || '?') + ' months to build' : 'No land price yet';
  if(id === 'income') return Number(s.avgRent) ? 'Rent ' + money0(Number(s.avgRent)) + ' a unit a month, vacancy ' + pc(Number(s.vacancy), 1) + (c.egi ? ', income ' + money0(c.egi) : '') : 'No rent entered yet';
  if(id === 'expenses') return c.noi ? 'NOI ' + money0(c.noi) + (p ? ', ' + pc(c.noi / p, 2) + ' on price' : '') + (c.egi ? ', expenses ' + pc(1 - c.noi / c.egi, 0) + ' of income' : '') : 'No expenses entered yet';
  if(id === 'debt'){ if(dev) return 'Construction loan ' + pc(Number(s.conLTC), 0) + ' of cost at ' + pc(Number(s.conRate), 2); var d = safe(function(){ return bkDebt(); }, null); return s.debtEnabled === false ? 'All cash' : d && d.loan ? 'Loan ' + money0(d.loan) + ' (' + pc(d.ltv, 0) + ' of price) at ' + pc(Number(s.acqRate), 2) + ', coverage ' + (d.dscr ? d.dscr.toFixed(2) + 'x' : '—') : 'No loan sized yet'; }
  if(id === 'exit') return (s.holdYears || '?') + ' years, exit cap ' + pc(Number(s.exitCap), 2) + ', rent growth ' + pc(Number(s.rentGrowth), 1);
  return '';
}

/* ------------------------------------------------------------ safeguards: a figure that cannot be right is stopped (red, and the step will not continue); one that is unusual is flagged (amber) with what is typical */
var LIM = { acqLTV:{ hi:1, soft:[0.4, 0.8], say:'Lenders rarely go above 75% on stabilized multifamily; above 80% is unusual.' }, conLTC:{ hi:1, soft:[0.5, 0.75], say:'Construction lenders usually lend 60% to 70% of cost.' },
  acqRate:{ hi:0.25, soft:[0.03, 0.12], say:'Rates between 4% and 9% are typical today.' }, conRate:{ hi:0.25, soft:[0.04, 0.12], say:'Construction rates are usually 6% to 10%.' }, permRate:{ hi:0.25, soft:[0.03, 0.12], say:'Permanent rates are usually 4% to 8%.' },
  acqAmort:{ hi:40, soft:[20, 30], say:'25 to 30 years is standard.' }, permAmort:{ hi:40, soft:[20, 30], say:'25 to 30 years is standard.' }, acqIO:{ hi:10, soft:[0, 5], say:'Interest-only periods are usually 0 to 3 years.' },
  acqOrigFee:{ hi:0.1, soft:[0, 0.02], say:'Origination fees are usually 0.5% to 1.5%.' }, closingCostsPct:{ hi:0.15, soft:[0.005, 0.04], say:'Closing costs are usually 1.5% to 3% of price.' },
  vacancy:{ hi:0.9, soft:[0.03, 0.2], say:'Vacancy is usually 5% to 10%.' }, mgmtPct:{ hi:0.15, soft:[0.02, 0.06], say:'Management fees are usually 3% to 5% of income.' },
  exitCap:{ hi:0.25, lo:0.02, soft:[0.04, 0.09], say:'Exit cap rates are usually 4.5% to 8%.' }, rentGrowth:{ hi:0.15, soft:[0, 0.05], say:'Long-run rent growth is usually 2% to 3.5%.' }, opexGrowth:{ hi:0.15, soft:[0, 0.05], say:'Expense growth is usually about 3%.' },
  saleCostPct:{ hi:0.15, soft:[0.005, 0.04], say:'Selling costs are usually about 2%.' }, holdYears:{ hi:15, lo:1, soft:[3, 10], say:'The model runs up to 15 years; five to seven is typical.' },
  gpShare:{ hi:1, soft:[0, 0.5], say:'GP co-investment is usually 5% to 20% of the equity. Above 50% the sponsor puts in most of it.' }, pref:{ hi:1, soft:[0.05, 0.12], say:'Preferred returns are usually 6% to 10%.' },
  hurdle2:{ hi:1, soft:[0.08, 0.25], say:'A second hurdle is usually 10% to 15%.' }, hurdle3:{ hi:1, soft:[0.1, 0.3], say:'A third hurdle is usually 15% to 20%.' },
  t2LP:{ hi:1, soft:[0.4, 1], say:'LP shares above the preferred return are usually 70% to 90%.' }, t3LP:{ hi:1, soft:[0.4, 1], say:'LP shares fall as the hurdles are passed: usually 60% to 80% here.' }, t4LP:{ hi:1, soft:[0.4, 1], say:'LP shares fall as the hurdles are passed: usually 50% to 70% here.' },
  predevMonths:{ hi:60, soft:[0, 18], say:'Pre-development usually takes 3 to 12 months.' }, constructionMonths:{ hi:84, soft:[12, 30], say:'Mid-rise buildings usually take 16 to 24 months.' }, leaseupMonths:{ hi:60, soft:[3, 24], say:'Lease-up usually takes 10 to 16 months.' },
  capRefiDebtYield:{ hi:1, soft:[0.06, 0.13], say:'Lenders usually want a debt yield of 8% to 11%.' }, capSellCoE:{ hi:1, soft:[0.01, 0.1], say:'Sell levels for cash-on-equity are usually 3% to 6%.' }, capSellNOIGrowth:{ hi:1, soft:[0, 0.05], say:'Growth sell levels are usually 1% to 3%.' }, capKeepCoE:{ hi:1, soft:[0.03, 0.15], say:'Keep levels for cash-on-equity are usually 5% to 8%.' },
  capRefiHeadroom:{ hi:1e9, say:'' },
  units:{ hi:20000 } };
function pctTxt(v){ return (Math.round(v * 10000) / 100) + '%'; }
function checks(sec, s){
  var out = {}, val = function(k){ var fl = null; sec.fields.forEach(function(x){ if(x.k === k) fl = x; }); return fl ? cur(s, fl) : s[k]; }, num = function(k){ var v = val(k); return v === '' || v == null ? NaN : Number(v); };
  function add(k, lvl, text){ (out[k] = out[k] || []).push({ lvl:lvl, text:text }); }
  sec.fields.forEach(function(fl){ if(fl.t === 'text' || fl.t === 'bool') return; var v = num(fl.k); if(!isFinite(v) || v === 0 && !LIM[fl.k]) return; var L = LIM[fl.k] || {}, p = fl.t === 'pct', show = p ? pctTxt(v) : v.toLocaleString('en-US');
    if(v < 0){ add(fl.k, 'err', show + ' is negative. This cannot be below zero.'); return; }
    if(p && v > (L.hi != null ? L.hi : 1)){ add(fl.k, 'err', show + ' is more than ' + pctTxt(L.hi != null ? L.hi : 1) + (L.hi == null || L.hi === 1 ? '. A percentage cannot be over 100 percent: type 8 for 8 percent.' : '. That cannot be right: type 8 for 8 percent.') + (L.say ? ' ' + L.say : '')); return; }
    if(!p && L.hi != null && v > L.hi){ add(fl.k, 'err', show + ' is more than the model allows (' + L.hi.toLocaleString('en-US') + '). ' + (L.say || '')); return; }
    if(L.lo != null && v > 0 && v < L.lo){ add(fl.k, 'err', show + ' is below ' + (p ? pctTxt(L.lo) : L.lo) + ', which is not a credible figure here. Percentages are typed as whole numbers: 5 means 5 percent.'); return; }
    if(v === 0) return;
    if(p && v < 0.01 && L.soft && L.soft[0] >= 0.03) add(fl.k, 'warn', show + ' is very small. Percentages are typed as whole numbers: did you mean ' + (v * 100) + ' percent?');
    else if(L.soft && (v < L.soft[0] || v > L.soft[1])) add(fl.k, 'warn', show + ' is outside the usual range. ' + (L.say || '')); });
  /* between fields */
  var pref = num('pref'), h2 = num('hurdle2'), h3 = num('hurdle3'), t2 = num('t2LP'), t3 = num('t3LP'), t4 = num('t4LP'), gp = num('gpShare'), io = num('acqIO'), am = num('acqAmort');
  if(isFinite(h2) && isFinite(pref) && h2 > 0 && pref > 0 && h2 <= pref) add('hurdle2', 'err', 'The second hurdle (' + pctTxt(h2) + ') must be higher than the preferred return (' + pctTxt(pref) + '); otherwise the split above the pref never applies.');
  if(isFinite(h3) && isFinite(h2) && h3 > 0 && h2 > 0 && h3 <= h2) add('hurdle3', 'err', 'The third hurdle (' + pctTxt(h3) + ') must be higher than the second hurdle (' + pctTxt(h2) + ').');
  if(isFinite(h3) && h3 > 0 && !(h2 > 0)) add('hurdle3', 'warn', 'A third hurdle needs a second hurdle below it.');
  if(isFinite(t3) && isFinite(t2) && t3 > t2) add('t3LP', 'warn', 'The LP share usually falls as the hurdles are passed, but this (' + pctTxt(t3) + ') is higher than the share before it (' + pctTxt(t2) + ').');
  if(isFinite(t4) && isFinite(t3) && t4 > t3) add('t4LP', 'warn', 'The LP share usually falls as the hurdles are passed, but this (' + pctTxt(t4) + ') is higher than the share before it (' + pctTxt(t3) + ').');
  if(isFinite(gp) && gp > 0 && !(pref > 0) && sec.fields.some(function(x){ return x.k === 'pref'; })) add('pref', 'info', 'There is a GP share but no preferred return. Without one, profit is split from the first dollar.');
  var ks = num('capSellCoE'), kk = num('capKeepCoE'); if(isFinite(ks) && isFinite(kk) && ks > 0 && kk > 0 && kk < ks) add('capKeepCoE', 'err', 'The keep level (' + pctTxt(kk) + ') cannot be lower than the sell level (' + pctTxt(ks) + '); between them the test would say both keep and sell.');
  var ga = num('gsf'), la = num('gla'); if(isFinite(ga) && isFinite(la) && ga > 0 && la > 0){ if(la > ga) add('gla', 'err', 'Leasable area (' + la.toLocaleString('en-US') + ' SF) cannot be more than the gross building area (' + ga.toLocaleString('en-US') + ' SF). Gross includes corridors, lobbies and mechanical space; leasable is what tenants rent.'); else if(la / ga < 0.6) add('gla', 'warn', 'Leasable area is only ' + pctTxt(la / ga) + ' of the gross building area. Check both figures; most buildings are 75 to 90 percent efficient.'); }
  if(isFinite(io) && isFinite(am) && am > 0 && io > am) add('acqIO', 'err', 'Interest-only years (' + io + ') cannot be longer than the amortization (' + am + ' years).');
  return out; }
function msgHtml(list){ return (list || []).map(function(m){ return '<div class="' + m.lvl + '">' + (m.lvl === 'err' ? 'Fix this: ' : m.lvl === 'warn' ? 'Check this: ' : '') + esc(m.text) + '</div>'; }).join(''); }
function errorsOf(sec, s){ var m = checks(sec, s), o = []; Object.keys(m).forEach(function(k){ m[k].forEach(function(x){ if(x.lvl === 'err') o.push({ k:k, text:x.text }); }); }); return o; }
function paintMsgs(sec){ var s = bkLoad(), m = checks(sec, s); sec.fields.forEach(function(fl){ var el = document.getElementById('gdm-' + fl.k); if(el) el.innerHTML = msgHtml(m[fl.k]); });
  var errs = errorsOf(sec, s), btn = document.getElementById('gd-next'); if(btn){ btn.disabled = errs.length > 0; btn.title = errs.length ? 'Fix the red items first' : ''; btn.textContent = errs.length ? 'Fix the red items to continue' : 'Looks right, continue'; btn.style.opacity = errs.length ? '.55' : ''; } }
/* sources and uses: what the deal costs, what the loan covers, and who puts up the equity. Read from the engine under the figures being edited. */
function isDevS(s){ return /develop/i.test(String(s.dealType || '')); }
function suInner(s0){
  var F = safe(function(){ return window.bkRunWith(Object.assign({}, st.draft), function(){ return bkFundingSummary(); }); }, null);
  if(!F || !(F.totalUses > 0)) return '<div class="gd-card" style="font-size:13px">Enter the price, the budget and the financing first; then the cost, the loan and the equity appear here.</div>';
  function row(a, b, c, cls){ return '<tr' + (cls ? ' class="' + cls + '"' : '') + '><td>' + esc(a) + '</td><td style="text-align:right">' + (b == null ? '' : money0(b)) + '</td><td style="text-align:right">' + (c == null ? '' : esc(c)) + '</td></tr>'; }
  var T = 'width:100%;border-collapse:collapse;font-size:13px', cells = 'padding:6px 8px;border-bottom:1px solid var(--line,#e3e8ee)', dev = F.dev, tu = F.totalUses;
  var uses = F.uses.filter(function(r){ return Math.abs(r[1]) > 0.5; });
  var gpTxt = F.gpEquity > 0 ? pctTxt(F.gpEquity / F.equity) : '0% (none)';
  return '<div class="gd-card gd-su"><style>.gd-su td,.gd-su th{' + cells + '}.gd-su th{text-align:left;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-500,#566a80)}.gd-su tr.t td{font-weight:700;border-top:2px solid #0e2a4a}</style>'
   + '<div style="font-size:12px;color:var(--ink-500,#566a80);margin-bottom:8px"><b>Read only.</b> These figures come from the same calculation as the Sources &amp; Uses page. Change them where they are entered: the loan on the Financing step, the GP equity share in the Partnership panel, the investors on the Investors page.</div>'
   + '<table style="' + T + '"><thead><tr><th>Uses: what the deal costs</th><th style="text-align:right">$</th><th style="text-align:right">% of uses</th></tr></thead><tbody>' + uses.map(function(r){ return row(r[0], r[1], pctTxt(r[1] / tu)); }).join('') + row('Total uses', tu, null, 't') + '</tbody></table>'
   + '<table style="' + T + ';margin-top:14px"><thead><tr><th>Sources: where the money comes from</th><th style="text-align:right">$</th><th style="text-align:right">% of uses</th></tr></thead><tbody>'
   + row(dev ? 'Construction facility (draws + capitalized interest)' : 'Loan', F.loan, pctTxt(F.loan / tu)) + row('Equity at funding', F.equity, pctTxt(F.equity / tu)) + row('Total sources', F.totalSources, null, 't') + '</tbody></table>'
   + '<table style="' + T + ';margin-top:14px"><thead><tr><th>Who puts up the equity at funding</th><th style="text-align:right">$</th><th style="text-align:right">% of equity</th></tr></thead><tbody>'
   + row('GP / sponsor equity', F.gpEquity, gpTxt) + row('Limited partners (LPs)', F.lpEquity, pctTxt(F.equity ? F.lpEquity / F.equity : 1)) + row('Total equity', F.equity, null, 't') + '</tbody></table>'
   + (F.postClosing > 1 ? '<div style="font-size:12.5px;margin-top:10px">Equity contributed in the returns over the hold: ' + money0(F.contributed) + ' (' + money0(F.postClosing) + ' after funding: ' + (dev ? 'takeout and operating shortfalls' : 'balloon equity, refinance shortfall or operating shortfalls') + ').</div>' : '')
   + '<div style="font-size:12.5px;margin-top:10px;color:var(--ink-500,#566a80)">The GP equity share is what the GP puts in. It is separate from the GP\'s share of the profits (preferred return, catch-up and promote tiers), which are set on the next step.' + (F.failed.length ? ' <b style="color:#a32f24">Does not tie: ' + esc(F.failed[0].label) + '.</b>' : '') + '</div>'
   + '<div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="pl-hbtn" onclick="document.documentElement.classList.remove(\'bk-guide\');bkEdGo(\'Investment\',\'Investment\',\'jv\')">Edit GP equity share (Investment &rsaquo; Partnership)</button><button type="button" class="pl-hbtn" onclick="bkGuideDetail(\'Investors\')">Investors page</button><button type="button" class="pl-hbtn" onclick="bkGuideDetail(\'Sources & Uses\')">Full Sources &amp; Uses</button></div></div>';
}
function paintSU(sec){ var el = document.getElementById('gd-su'); if(el) el.innerHTML = suInner(bkLoad()); }

/* ------------------------------------------------------------ pages */
function css(){ return css0() + '<style id="bk-guide-safe">.gd-m{grid-column:1/-1;font-size:12.5px}.gd-m div{padding:5px 9px;border-left:3px solid;margin-top:5px;line-height:1.4}.gd-m .err{color:#a32f24;background:#fbe6e3;border-color:#c0392b}.gd-m .warn{color:#8a5a12;background:#fbf1dc;border-color:#b7791f}.gd-m .info{color:#1b3f66;background:#eaf1fa;border-color:#1f4e8c}#gd-next:disabled{cursor:not-allowed}</style>'; }
function css0(){ return '<style id="bk-guide-css">html.bk-guide .rail,html.bk-guide .tabnav,html.bk-guide .bk-flow,html.bk-guide .side-col,html.bk-guide .bk-stepnav,html.bk-guide .title-block,html.bk-guide .pl-toolbar{display:none !important}html.bk-guide .shell{grid-template-columns:1fr !important}'
 + '.gd{max-width:780px;margin:0 auto;padding:26px 18px 90px}.gd h1{font-size:26px;margin:6px 0 4px}.gd .sub{color:var(--ink-500,#566a80);font-size:14px;margin:0 0 18px;line-height:1.5}.gd-prog{display:flex;gap:6px;flex-wrap:wrap;margin:0 0 22px}.gd-chip{display:flex;align-items:center;gap:6px;border:1px solid var(--line,#dbe4ec);background:var(--surface,#fff);border-radius:999px;padding:6px 12px;font-size:12px;cursor:pointer;color:inherit}.gd-chip i{font-style:normal;width:16px;height:16px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:10px;background:#e8eef5}.gd-chip.cur{border-color:#1a7fd6;box-shadow:0 0 0 1px #1a7fd6 inset;font-weight:700}.gd-chip.done i{background:#2e8b57;color:#fff}.gd-chip.skipped i{background:#e3a72f;color:#fff}.gd-chip.partial i{background:#e3a72f;color:#fff}.gd-chip.filled i{background:#bfdbf5;color:#12609f}'
 + '.gd-card{background:var(--surface,#fff);border:1px solid var(--line,#dbe4ec);border-radius:12px;padding:18px 20px;margin-bottom:14px}.gd-f{display:grid;grid-template-columns:1fr 190px;gap:6px 16px;align-items:center;padding:10px 0;border-top:1px solid var(--line,#eef2f6)}.gd-f:first-child{border-top:0}.gd-f label{font-size:14px;font-weight:600}.gd-f .h{font-size:12px;color:var(--ink-500,#566a80);font-weight:400;display:block;margin-top:2px}.gd-f input[type=text]{width:100%;padding:9px 11px;border:1px solid var(--line,#dbe4ec);border-radius:8px;font:inherit;font-size:15px;text-align:right}.gd-f input.chg{border-color:#1a7fd6;background:#f0f7fe}'
 + '.gd-view{font-size:11px;margin-left:6px;color:#12609f}.gd-chk{font-size:12.5px;font-weight:400 !important;color:var(--ink-500,#566a80);display:flex;gap:6px;align-items:center}.gd-adv{background:#fffaf0;border:1px solid #f0dfb4;border-radius:12px;padding:12px 16px;margin-bottom:14px;font-size:13.5px}.gd-adv b{display:block;margin-bottom:6px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#8a6410}.gd-adv .it{display:flex;gap:10px;align-items:center;padding:5px 0;border-top:1px solid #f4e8c8}.gd-adv .it:first-of-type{border-top:0}.gd-adv .it span{flex:1}.gd-imp{font-size:13px;background:#f0f7fe;border:1px solid #bfdbf5;border-radius:10px;padding:9px 14px;margin-bottom:14px;display:flex;gap:16px;flex-wrap:wrap}.gd-imp b{font-size:15px}.gd-dbt{font-size:13px;background:#f6f8fb;border-radius:10px;padding:10px 14px;margin-top:12px;line-height:1.55}.gd-where{display:grid;grid-template-columns:1fr;gap:8px}.gd-w{display:grid;grid-template-columns:34px 1fr auto;gap:12px;align-items:center;border:1px solid var(--line,#dbe4ec);background:var(--surface,#fff);border-radius:12px;padding:12px 14px;cursor:pointer;text-align:left;font:inherit;color:inherit}.gd-w:hover{border-color:#1a7fd6}.gd-w i{font-style:normal;width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;background:#e8eef5}.gd-w.done i{background:#2e8b57;color:#fff}.gd-w.filled i{background:#bfdbf5;color:#12609f}.gd-w.skipped i,.gd-w.partial i{background:#e3a72f;color:#fff}.gd-w small{display:block;color:var(--ink-500,#566a80);font-size:12.5px;margin-top:2px}.gd-sug{grid-column:1/-1;font-size:12.5px;background:#eef5fc;border-left:3px solid #1a7fd6;border-radius:0 8px 8px 0;padding:7px 11px;display:flex;gap:10px;align-items:center;flex-wrap:wrap}.gd-sug button{margin-left:auto}.gd-tag{display:inline-block;font-size:10px;letter-spacing:.08em;text-transform:uppercase;font-weight:700;border-radius:999px;padding:2px 8px;margin-left:8px;vertical-align:middle}.gd-tag.from{background:#e3f3ea;color:#1f7a4c}.gd-tag.assumed{background:#fbf1d9;color:#8a6410}'
 + '.gd-act{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-top:16px}.gd-btn{border:1px solid #0e2a4a;background:#0e2a4a;color:#fff;border-radius:999px;padding:10px 20px;font:700 12px inherit;letter-spacing:.08em;text-transform:uppercase;cursor:pointer}.gd-btn.ghost{background:transparent;color:#0e2a4a}.gd-btn.link{border:0;background:none;color:#12609f;padding:10px 4px;text-decoration:underline}.gd-chg{font-size:13px;background:#f0f7fe;border:1px solid #bfdbf5;border-radius:10px;padding:10px 14px;margin-top:14px}.gd-chg b{display:block;margin-bottom:4px}.gd-res{display:flex;gap:18px;flex-wrap:wrap;font-size:13px;margin-top:6px}.gd-res span b{font-size:16px}'
 + '.gd-start{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px}.gd-opt{border:1px solid var(--line,#dbe4ec);background:var(--surface,#fff);border-radius:12px;padding:16px 18px;text-align:left;cursor:pointer;font:inherit;color:inherit}.gd-opt:hover{border-color:#1a7fd6}.gd-opt b{display:block;font-size:15px;margin-bottom:4px}.gd-opt span{font-size:12.5px;color:var(--ink-500,#566a80);line-height:1.45}'
 + '#bk-guide-back{position:fixed;left:18px;bottom:18px;z-index:80;background:#0e2a4a;color:#fff;border:0;border-radius:999px;padding:11px 18px;font:700 12px inherit;letter-spacing:.06em;cursor:pointer;box-shadow:0 6px 18px rgba(14,42,74,.35)}'
 + '#pl-guide-toggle{display:inline-flex;align-items:center;gap:8px;background:transparent;border:1px solid rgba(255,255,255,.35);color:#fff;border-radius:999px;padding:7px 13px;font:700 10.5px inherit;letter-spacing:.1em;text-transform:uppercase;cursor:pointer}#pl-guide-toggle i{width:26px;height:14px;border-radius:7px;background:rgba(255,255,255,.3);position:relative;display:inline-block}#pl-guide-toggle i:after{content:"";position:absolute;top:2px;left:2px;width:10px;height:10px;border-radius:50%;background:#fff;transition:left .15s}#pl-guide-toggle.on i{background:#3E9AE6}#pl-guide-toggle.on i:after{left:14px}@media (max-width:760px){.gd-f{grid-template-columns:1fr}.gd-w{grid-template-columns:30px 1fr}.gd-w>small:last-child{grid-column:2}}@media (max-width:560px){#pl-guide-toggle{font-size:0;padding:7px 9px}#pl-guide-toggle i{margin:0}.pl-user button{padding:6px 9px;font-size:9.5px}.brand-mark .sub{display:none}.pl-searchwrap{gap:6px}}</style>'; }

function progress(secs, s, g){ return '<div class="gd-prog">' + secs.map(function(sec, i){ var sv = status(sec, s, g), cls = (st.step === sec.id ? 'cur ' : '') + sv, mark = sv === 'done' ? '✓' : sv === 'skipped' ? '⚑' : sv === 'partial' ? '!' : sv === 'filled' ? '●' : (i + 1); return '<button type="button" class="gd-chip ' + cls + '" onclick="bkGuideGo(\'' + sec.id + '\')"><i>' + mark + '</i>' + esc(sec.title.replace(/^The /, '').replace(/^./, function(c){ return c.toUpperCase(); })) + '</button>'; }).join('') + '<button type="button" class="gd-chip' + (st.step === 'review' ? ' cur' : '') + '" onclick="bkGuideGo(\'review\')"><i>★</i>Review</button></div>'; }

function startScreen(){
  return '<div class="gd"><h1>Let\'s set up a deal</h1><p class="sub">Two ways in. Either way, nothing is changed until you confirm it, you can skip any step, and the guide reminds you what you skipped.</p>'
   + '<div class="gd-start"><button type="button" class="gd-opt" onclick="bkGuideBlank(\'Acquisition\')"><b>Start from blank: an acquisition</b><span>A building you would buy and operate. About 15 questions, in a logical order.</span></button>'
   + '<button type="button" class="gd-opt" onclick="bkGuideBlank(\'Development\')"><b>Start from blank: a development</b><span>Land, a construction budget and a timeline, then financing and exit.</span></button>'
   + '<button type="button" class="gd-opt" onclick="bkGuideDoc(\'Import OM\')"><b>Start from an offering memorandum</b><span>Upload the PDF. I read the price, units, rents and expenses, then walk you through confirming them and what is missing.</span></button>'
   + '<button type="button" class="gd-opt" onclick="bkGuideDoc(\'Import Deal\')"><b>Start from a T-12</b><span>Upload a Yardi operating statement. Income and expenses load; I ask for the rest.</span></button></div>'
   + '<div class="gd-act"><button type="button" class="gd-btn link" onclick="bkGuideOff()">Turn the guide off and use the full app</button></div></div>';
}
function fieldRow(fl, s, g){
  var v = cur(s, fl), tag = '', changed = Object.prototype.hasOwnProperty.call(st.draft, fl.k), id = 'gdf-' + fl.k;
  if(g.from && g.from.keys.indexOf(fl.k) >= 0 && g.assumed.indexOf(fl.k) < 0){ var pg = srcPage(g, fl.k); tag = '<span class="gd-tag from">from the ' + esc(g.from.label) + (pg ? ', p.' + pg : '') + '</span>' + (pg && g.from.label === 'OM' ? '<a href="#" class="gd-view" onclick="bkGuideViewSource(' + pg + ');return false">view</a>' : ''); }
  var unchecked = g.assumed.indexOf(fl.k) >= 0 && !g.confirmed[fl.k] && !st.checked[fl.k] && !changed; if(unchecked) tag = '<span class="gd-tag assumed">my assumption: check it</span>';
  var imp = s._imp && s._imp.fields && s._imp.fields[fl.k], flagged = imp && !changed && !st.checked[fl.k] && !unchecked;
  if(flagged) tag = '<span class="gd-tag assumed" title="' + esc(imp.why) + '">' + (imp.l === 'low' ? 'import: low confidence' : 'import: check it') + '</span>';
  var input;
  if(fl.t === 'bool') input = '<label style="display:flex;gap:8px;justify-content:flex-end;font-weight:400"><input type="checkbox" id="' + id + '"' + (v !== false && v !== 0 ? ' checked' : '') + ' onchange="bkGuideDraft(\'' + fl.k + '\',this.checked)"> Yes</label>';
  else input = '<input type="text" id="' + id + '" value="' + esc(fmt(fl, v)) + '" class="' + (changed ? 'chg' : '') + '" onchange="bkGuideDraft(\'' + fl.k + '\',this.value)" autocomplete="off">' ;
  var sug = fl.sug ? safe(function(){ return fl.sug(Object.assign({}, s, st.draft)); }, null) : null, empty = fl.t === 'text' ? !String(v || '').trim() : !(Number(v) > 0), same = sug && Math.abs(Number(v) - sug.v) < 1e-9;
  var sugRow = sug && !same && (empty || (g.assumed.indexOf(fl.k) >= 0 && !g.confirmed[fl.k])) ? '<div class="gd-sug"><span>I suggest <b>' + esc(fmt(fl, sug.v)) + (fl.t === 'pct' ? '%' : '') + '</b>. ' + esc(sug.why) + '</span><button type="button" class="gd-btn ghost" style="padding:6px 14px" onclick="bkGuideUse(\'' + fl.k + '\')">Use this</button></div>' : '';
  var chk = unchecked || flagged ? (flagged ? '<div style="font-size:12px;margin:0 0 4px">' + esc(imp.why) + '</div>' : '') + '<label class="gd-chk"><input type="checkbox" onchange="bkGuideCheck(\'' + fl.k + '\',this.checked)"> I have checked this figure</label>' : '';
  return '<div class="gd-f"><label for="' + id + '">' + esc(fl.label + (fl.t === 'pct' && fl.label.indexOf('%') < 0 ? ' (%)' : '')) + (fl.req ? ' <span style="color:#b23a2c">*</span>' : '') + tag + (fl.help ? '<span class="h">' + esc(fl.help) + '</span>' : '') + '</label>' + input + '<div class="gd-m" id="gdm-' + fl.k + '">' + msgHtml((st.msgs || {})[fl.k]) + '</div>' + sugRow + (chk ? '<div style="grid-column:1/-1">' + chk + '</div>' : '') + '</div>';
}
function changeList(s, sec){ var rows = Object.keys(st.draft).map(function(k){ var fl = sec.fields.filter(function(x){ return x.k === k; })[0]; if(!fl) return ''; var a = fmt(fl, s[k]), b = fmt(fl, st.draft[k]), sfx = fl.t === 'pct' ? '%' : ''; return esc(fl.label) + ': ' + (a === '' ? '(blank)' : esc(a) + sfx) + ' → <b style="display:inline">' + esc(b) + sfx + '</b>'; }).filter(Boolean); return rows; }
function resultStrip(s, sec){
  var c = safe(function(){ return bkCalc(); }, null), out = [];
  if(!c) return '';
  if(sec.id === 'income' || sec.id === 'expenses'){ if(c.egi) out.push('<span>Income <b>' + money0(c.egi) + '</b></span>'); if(c.noi) out.push('<span>Net operating income <b>' + money0(c.noi) + '</b></span>'); var p = Number(s.purchasePrice) || 0; if(c.noi && p) out.push('<span>Cap rate on price <b>' + (c.noi / p * 100).toFixed(2) + '%</b></span>'); }
  if(sec.id === 'debt'){ var d = safe(function(){ return bkDebt(); }, null); if(d && d.loan) out.push('<span>Loan <b>' + money0(d.loan) + '</b></span><span>Coverage <b>' + (d.dscr ? d.dscr.toFixed(2) + 'x' : '—') + '</b></span><span>Equity <b>' + money0(d.equity) + '</b></span>'); }
  return out.length ? '<div class="gd-res">' + out.join('') + '</div>' : '';
}
function stepScreen(secs, sec, s, g){
  var i = secs.indexOf(sec), miss = missing(sec, s);
  var body = '<div class="gd"><div style="display:flex;justify-content:space-between;align-items:center"><div style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#12609f;font-weight:700">Step ' + (i + 1) + ' of ' + secs.length + '</div><button type="button" class="gd-btn link" style="padding:0" onclick="bkGuideWhere()">Where this deal stands</button></div><h1>' + esc(sec.title) + '</h1><p class="sub">' + esc(sec.why) + '</p>' + progress(secs, s, g);
  var fromNote = g.from && sec.fields.some(function(fl){ return g.from.keys.indexOf(fl.k) >= 0; }) ? '<div class="gd-card" style="background:#f4faf6;border-color:#cfe8d8;font-size:13px">Filled in from the ' + esc(g.from.label) + '. Check each figure against the source before you confirm.</div>' : '';
  var adv = advice(s).filter(function(a){ return a.sec === sec.id; }).slice(0, 3);
  var advBox = adv.length ? '<div class="gd-adv"><b>Worth a look, from what is entered now</b>' + adv.map(function(a){ return '<div class="it"><span>' + esc(a.text) + '</span>' + (a.fix ? '<button type="button" class="gd-btn ghost" style="padding:6px 14px" onclick="bkGuideProp(\'' + a.fix.k + '\',' + a.fix.v + ')">' + esc(a.fix.label) + '</button>' : '') + '</div>'; }).join('') + '</div>' : '';
  var rr = sec.id === 'income' ? rentRollNote(s) : '';
  st.msgs = checks(sec, s);
  body += fromNote + advBox + '<div id="gd-imp"></div><div class="gd-card">' + sec.fields.map(function(fl){ return fieldRow(fl, s, g); }).join('') + rr + resultStrip(s, sec) + '</div>' + (sec.id === 'debt' && !/develop/i.test(String(s.dealType || '')) ? '<div id="gd-dbt"></div>' : '');
  body += (sec.id === 'sources' ? '<div id="gd-su">' + suInner(s) + '</div>' : '') + '<div id="gd-chg"></div>';
  body += '<div class="gd-act"><button type="button" class="gd-btn" id="gd-next" onclick="bkGuideNext()">Looks right, continue</button><button type="button" class="gd-btn ghost" onclick="bkGuideSkip()">Skip for now</button>' + (i > 0 ? '<button type="button" class="gd-btn link" onclick="bkGuideBack()">Back</button>' : '') + '<button type="button" class="gd-btn link" style="margin-left:auto" onclick="bkGuideDetail(\'' + sec.sheet + '\')">Add more detail on the full sheet</button></div><div style="margin-top:6px"><button type="button" class="gd-btn link" onclick="bkGuideNew()">Start a different deal</button></div>';
  body += (miss.length ? '<p class="sub" style="margin-top:10px">Still needed here: ' + miss.map(function(m){ return esc(m.label.toLowerCase()); }).join(', ') + '.</p>' : '') + '</div>';
  return body;
}
function adviceAll(s){ return advice(s).filter(function(a){ return a.lvl === 'warn'; }).slice(0, 4); }
function reviewScreen(secs, s, g){
  var skipped = secs.filter(function(sec){ return g.skipped[sec.id]; }), todo = secs.filter(function(sec){ return !g.done[sec.id] && !g.skipped[sec.id]; }), partial = secs.filter(function(sec){ return g.done[sec.id] && missing(sec, s).length; });
  var unconf = g.assumed.filter(function(k){ return !g.confirmed[k]; });
  var k = safe(function(){ return window.bkProFormaKit && bkProFormaKit.build(); }, null), gate = safe(function(){ return bkDealGate(); }, null), conf = safe(function(){ return window.bkConflicts ? window.bkConflicts().filter(function(c){ return c.level !== 'INFO' && !c.acknowledged; }) : []; }, []);
  var h = '<div class="gd"><div style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#12609f;font-weight:700">Last step</div><h1>Review</h1><p class="sub">Here is where the deal stands and what is still open.</p>' + progress(secs, s, g);
  if(k) h += '<div class="gd-card"><div class="gd-res" style="font-size:14px"><span>Levered IRR <b>' + (isFinite(k.irr) ? (k.irr * 100).toFixed(2) + '%' : '—') + '</b></span><span>Multiple <b>' + (isFinite(k.moic) ? k.moic.toFixed(2) + 'x' : '—') + '</b></span>' + (k.Y && k.Y[0] && k.Y[0].dscr ? '<span>Year-1 coverage <b>' + k.Y[0].dscr.toFixed(2) + 'x</b></span>' : '') + (gate ? '<span>Credit gate <b>' + esc(gate.verdict) + '</b></span>' : '') + '</div></div>';
  var open = [];
  skipped.forEach(function(sec){ open.push('<li><b>' + esc(sec.title) + '</b> was skipped. <a href="#" onclick="bkGuideGo(\'' + sec.id + '\');return false">Go back</a></li>'); });
  todo.forEach(function(sec){ open.push('<li><b>' + esc(sec.title) + '</b> has not been done. <a href="#" onclick="bkGuideGo(\'' + sec.id + '\');return false">Do it</a></li>'); });
  partial.forEach(function(sec){ open.push('<li><b>' + esc(sec.title) + '</b> is missing ' + missing(sec, s).map(function(m){ return esc(m.label.toLowerCase()); }).join(', ') + '. <a href="#" onclick="bkGuideGo(\'' + sec.id + '\');return false">Fix</a></li>'); });
  if(unconf.length){ var labs = unconf.map(function(k){ var fl = null; secs.forEach(function(sc){ sc.fields.forEach(function(x){ if(x.k === k) fl = { l:x.label, sec:sc.id }; }); }); return fl ? '<a href="#" onclick="bkGuideGo(\'' + fl.sec + '\');return false">' + esc(fl.l.toLowerCase()) + '</a>' : esc(k); }); open.push('<li>' + unconf.length + ' assumption' + (unconf.length === 1 ? '' : 's') + ' I made for you ' + (unconf.length === 1 ? 'has' : 'have') + ' not been checked: ' + labs.join(', ') + '.</li>'); }
  var unrev = secs.filter(function(sec){ return status(sec, s, g) === 'filled'; }); if(unrev.length) open.push('<li>' + unrev.length + ' section' + (unrev.length === 1 ? ' is' : 's are') + ' filled in but not reviewed here: ' + unrev.map(function(x){ return esc(x.title.toLowerCase()); }).join(', ') + '.</li>');
  adviceAll(s).forEach(function(a){ open.push('<li>' + esc(a.text) + '</li>'); });
  if(conf.length) open.push('<li>' + conf.length + ' model check' + (conf.length === 1 ? '' : 's') + ' to look at. <a href="#" onclick="bkGuideDetail(\'Model Checks\');return false">Open Model Checks</a></li>');
  h += '<div class="gd-card"><b>' + (open.length ? 'Still open' : 'Nothing is open') + '</b>' + (open.length ? '<ul style="margin:8px 0 0 18px;padding:0;line-height:1.7">' + open.join('') + '</ul>' : '<p class="sub" style="margin:6px 0 0">Every step is done and every assumption has been checked.</p>') + '</div>';
  h += '<div class="gd-act"><button type="button" class="gd-btn" onclick="bkReportOpen()">Create PDF summary</button><button type="button" class="gd-btn ghost" onclick="bkGuideDetail(\'Returns\')">Open Returns</button><button type="button" class="gd-btn link" onclick="bkGuideBack()">Back</button><button type="button" class="gd-btn link" style="margin-left:auto" onclick="bkGuideOff()">Turn the guide off</button></div></div>';
  return h;
}

/* ------------------------------------------------------------ flow */
function firstOpen(secs, s, g){ var o = secs.filter(function(sec){ return !g.done[sec.id] && !g.skipped[sec.id]; })[0]; return o ? o.id : 'review'; }
function whereScreen(secs, s, g){
  var adv = advice(s), top = adv.slice(0, 4), first = secs.filter(function(sec){ var sv = status(sec, s, g); return sv === 'todo' || sv === 'skipped' || sv === 'partial'; })[0];
  var h = '<div class="gd"><div style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#12609f;font-weight:700">Where this deal stands</div><h1>' + esc(s.name || 'This deal') + '</h1><p class="sub">I read what is entered now. Nothing here changes it. Pick a section, or let me walk you through from the start.</p>';
  h += '<div class="gd-where">' + secs.map(function(sec, i){ var sv = status(sec, s, g), mark = sv === 'done' ? '✓' : sv === 'skipped' ? '⚑' : sv === 'partial' ? '!' : sv === 'filled' ? '●' : (i + 1), note = sv === 'todo' ? 'Needs: ' + missing(sec, s).map(function(m){ return m.label.toLowerCase(); }).join(', ') : sv === 'skipped' ? 'You skipped this' : sv === 'filled' ? 'Entered, not yet reviewed here' : sv === 'partial' ? 'Reviewed, but missing ' + missing(sec, s).map(function(m){ return m.label.toLowerCase(); }).join(', ') : 'Reviewed';
    return '<button type="button" class="gd-w ' + sv + '" onclick="bkGuideGo(\'' + sec.id + '\')"><i>' + mark + '</i><span><b>' + esc(sec.title) + '</b><small>' + esc(readLine(sec.id, s)) + '</small></span><small style="text-align:right">' + esc(note) + '</small></button>'; }).join('') + '</div>';
  if(top.length) h += '<div class="gd-adv" style="margin-top:16px"><b>Worth a look</b>' + top.map(function(a){ var sec = secOf(secs, a.sec); return '<div class="it"><span>' + esc(a.text) + '</span>' + (a.fix ? '<button type="button" class="gd-btn ghost" style="padding:6px 14px" onclick="bkGuideProp(\'' + a.fix.k + '\',' + a.fix.v + ')">' + esc(a.fix.label) + '</button>' : sec ? '<button type="button" class="gd-btn link" onclick="bkGuideGo(\'' + sec.id + '\')">Open</button>' : '') + '</div>'; }).join('') + '</div>';
  h += '<div class="gd-act"><button type="button" class="gd-btn" onclick="bkGuideGo(\'' + (first ? first.id : 'review') + '\')">' + (first ? 'Take me to ' + esc(first.title.toLowerCase()) : 'Go to the review') + '</button><button type="button" class="gd-btn ghost" onclick="bkGuideGo(\'' + secs[0].id + '\')">Walk me through from the start</button><button type="button" class="gd-btn link" onclick="bkGuideGo(\'review\')">Skip to the review</button><button type="button" class="gd-btn link" style="margin-left:auto" onclick="bkGuideNew()">Start a different deal</button></div></div>';
  return h;
}
function render(){
  var s = safe(function(){ return bkLoad(); }, null), hdr = { title:'', crumbs:'', desc:'', meta:{}, sidebar:'' };
  if(!active() || !s || !String(s.dealId || '').trim() || st.screen === 'start'){ hdr.main = css() + startScreen(); return hdr; }
  var secs = sections(s), g = gstate(s); if(st.screen === 'where'){ hdr.main = css() + whereScreen(secs, s, g); return hdr; } if(!st.step) st.step = firstOpen(secs, s, g);
  if(st.step === 'review'){ hdr.main = css() + reviewScreen(secs, s, g); return hdr; }
  var sec = secs.filter(function(x){ return x.id === st.step; })[0] || secs[0]; st.step = sec.id;
  hdr.main = css() + stepScreen(secs, sec, s, g); return hdr;
}
function show(){ if(typeof showSheet === 'function') showSheet('Guide'); }
window.bkGuideActive = function(){ return prefOn(); };
window.bkGuideOn = function(){ setPref(true); st.step = null; st.draft = {}; st.checked = {}; var has = active() && safe(function(){ var s = bkLoad(); return !!String(s.dealId || '').trim() && (Number(s.purchasePrice) > 0 || Number(s.units) > 0 || String(s.name || '').trim()); }, false); st.screen = has ? 'where' : 'start'; show(); paintToggle(); };
window.bkGuideNew = function(){ st.screen = 'start'; st.draft = {}; show(); };
window.bkGuideOff = function(){ setPref(false); st.draft = {}; document.documentElement.classList.remove('bk-guide'); backPill(); paintToggle(); if(typeof showSheet === 'function') showSheet('Home'); };
window.bkGuideToggle = function(){ if(prefOn()) bkGuideOff(); else bkGuideOn(); };
window.bkGuideGo = function(id){ st.draft = {}; st.checked = {}; st.step = id; st.screen = ''; show(); };
window.bkGuideDraft = function(k, raw){ var s = bkLoad(), sec = sections(s).filter(function(x){ return x.fields.some(function(fl){ return fl.k === k; }); })[0]; if(!sec) return; var fl = sec.fields.filter(function(x){ return x.k === k; })[0], v = fl.t === 'bool' ? !!raw : parse(fl, raw);
  if(v == null || (fl.t !== 'text' && fl.t !== 'bool' && !isFinite(v))) { delete st.draft[k]; } else if(String(v) === String(s[k])) { delete st.draft[k]; } else st.draft[k] = v; refreshChanges(sec); };
function rentRollNote(s){ var n = Array.isArray(s.rentRoll) ? s.rentRoll.length : 0; return '<div style="padding:10px 0;border-top:1px solid var(--line,#eef2f6);font-size:13px;display:flex;gap:10px;align-items:center;flex-wrap:wrap"><span style="flex:1;min-width:200px">' + (n ? 'A rent roll of <b>' + n + ' units</b> is loaded.' : 'No unit-by-unit rent roll: revenue uses the average rent above.') + '</span><button type="button" class="gd-btn ghost" style="padding:6px 14px" onclick="bkGuideDetail(\'Import Rent Roll\')">' + (n ? 'Replace it' : 'Import a rent roll') + '</button></div>'; }
function impact(sec){
  var s = bkLoad(), keys = Object.keys(st.draft), base = irrWith({}), alt = keys.length ? irrWith(st.draft) : null, el = document.getElementById('gd-imp'); if(!el) return;
  if(!base || !isFinite(base.irr)){ el.innerHTML = ''; return; }
  var ds = '<span>Levered IRR <b>' + pc(base.irr, 1) + '</b> · multiple <b>' + base.moic.toFixed(2) + 'x</b></span>';
  if(alt && isFinite(alt.irr) && Math.abs(alt.irr - base.irr) > 1e-6){ var dd = (alt.irr - base.irr) * 100; ds += '<span>With your changes <b>' + pc(alt.irr, 1) + '</b> (' + (dd >= 0 ? '+' : '') + dd.toFixed(2) + ' points)</span>'; }
  el.innerHTML = '<div class="gd-imp">' + ds + '</div>';
  var db = document.getElementById('gd-dbt'); if(db && sec.id === 'debt'){ var d = safe(function(){ return window.bkRunWith(Object.assign({}, st.draft), function(){ return bkDebt(); }); }, null); if(d && d.loan){ var bd = d.binding === 'DSCR' ? 'the coverage requirement' : d.binding === 'LTC' ? 'cost' : d.binding === 'LTV' ? 'loan-to-value' : d.binding; db.innerHTML = '<div class="gd-dbt"><b>What the lender would actually give</b><br>Loan <b>' + money0(d.loan) + '</b> (' + pc(d.ltv, 1) + ' of price), sized by <b>' + esc(bd) + '</b>. At the loan-to-value alone it would be ' + money0(d.byLTV) + (d.byDSCR ? ', and the coverage limit is ' + money0(d.byDSCR) : '') + '. Year-1 coverage ' + (d.dscr ? d.dscr.toFixed(2) + 'x' : '—') + ', equity needed <b>' + money0(d.equity) + '</b>.</div>'; } else db.innerHTML = ''; }
}
function refreshChanges(sec){ var s = bkLoad(), rows = changeList(s, sec), el = document.getElementById('gd-chg'), btn = document.getElementById('gd-next'); impact(sec); if(sec.id === 'sources') paintSU(sec); if(el) el.innerHTML = rows.length ? '<div class="gd-chg"><b>You are about to change</b>' + rows.join('<br>') + '</div>' : ''; if(btn) btn.textContent = rows.length ? 'Confirm ' + rows.length + ' change' + (rows.length === 1 ? '' : 's') + ' and continue' : 'Looks right, continue';
  [].forEach.call(document.querySelectorAll('.gd-f input[type=text]'), function(i){ var k = (i.id || '').replace('gdf-', ''); i.classList.toggle('chg', Object.prototype.hasOwnProperty.call(st.draft, k)); }); }
var refreshChanges0 = refreshChanges; refreshChanges = function(sec){ refreshChanges0(sec); paintMsgs(sec); };
window.bkGuideCheck = function(k, on){ if(on) st.checked[k] = 1; else delete st.checked[k]; };
window.bkGuideProp = function(k, v){ var s = bkLoad(), secs = sections(s), sec = secs.filter(function(x){ return x.fields.some(function(fl){ return fl.k === k; }); })[0]; if(!sec) return; st.step = sec.id; st.screen = ''; st.draft = {}; st.draft[k] = v; show(); setTimeout(function(){ refreshChanges(sec); }, 0); };
window.bkGuideWhere = function(){ st.screen = 'where'; st.draft = {}; show(); };
window.bkGuideViewSource = function(page){ window.bkDocsList().then(function(a){ var o = a.filter(function(f){ return f.slot === 'om'; })[0]; if(!o) return; var u = URL.createObjectURL(o.blob) + '#page=' + page; window.open(u, '_blank'); }); };
window.bkGuideUse = function(k){ var s = bkLoad(), sec = sections(s).filter(function(x){ return x.fields.some(function(fl){ return fl.k === k; }); })[0], fl = sec.fields.filter(function(x){ return x.k === k; })[0], sug = fl.sug(Object.assign({}, s, st.draft)); if(!sug) return; st.draft[k] = sug.v; var g = gstate(s); if(g.assumed.indexOf(k) >= 0){ /* using the suggestion is a confirmation */ } show(); setTimeout(function(){ refreshChanges(sec); }, 0); };
function apply(sec){ var s = bkLoad(), g = gstate(s), ch = st.draft, keys = Object.keys(ch); keys.forEach(function(k){ var im = s._imp && s._imp.fields && s._imp.fields[k]; if(im && window.bkLearn) window.bkLearn.log({ kind:'fix', field:k, was:s[k], now:ch[k], why:im.why, source:s._imp.source }); s[k] = ch[k]; });
  if('vacancy' in ch){ s.occupancy = 1 - ch.vacancy; if(s.commercialVacancy != null) s.commercialVacancy = ch.vacancy; }
  sec.fields.forEach(function(fl){ if(g.assumed.indexOf(fl.k) >= 0 && (st.checked[fl.k] || fl.k in ch)) g.confirmed[fl.k] = 1; });
  if(s._imp && s._imp.fields) sec.fields.forEach(function(fl){ if(st.checked[fl.k] || fl.k in ch) delete s._imp.fields[fl.k]; });
  g.done[sec.id] = 1; delete g.skipped[sec.id]; s._guide = { done:g.done, skipped:g.skipped, from:g.from, assumed:g.assumed, confirmed:g.confirmed }; bkSave(s); st.draft = {}; st.checked = {}; }
function nextId(secs, cur){ var i = secs.findIndex(function(x){ return x.id === cur; }); return i + 1 < secs.length ? secs[i + 1].id : 'review'; }
window.bkGuideNext = function(){ var s = bkLoad(), secs = sections(s), sec = secs.filter(function(x){ return x.id === st.step; })[0]; if(!sec) return; var bad = errorsOf(sec, s); if(bad.length){ paintMsgs(sec); var first = document.getElementById('gdf-' + bad[0].k); if(first && first.focus) first.focus(); return; } apply(sec); st.step = nextId(secs, sec.id); show(); };
window.bkGuideSkip = function(){ var s = bkLoad(), secs = sections(s), sec = secs.filter(function(x){ return x.id === st.step; })[0]; if(!sec) return; var g = gstate(s); g.skipped[sec.id] = 1; delete g.done[sec.id]; s._guide = { done:g.done, skipped:g.skipped, from:g.from, assumed:g.assumed, confirmed:g.confirmed }; bkSave(s); st.draft = {}; st.step = nextId(secs, sec.id); show(); };
window.bkGuideBack = function(){ var s = bkLoad(), secs = sections(s), i = st.step === 'review' ? secs.length : secs.findIndex(function(x){ return x.id === st.step; }); st.draft = {}; st.step = i > 0 ? secs[i - 1].id : secs[0].id; show(); };
window.bkGuideDetail = function(sheet){ document.documentElement.classList.remove('bk-guide'); if(typeof showSheet === 'function') showSheet(sheet); };
/* start the guide on the deal just created (from the new-analysis dialog): no second deal is made */
window.bkGuideBegin = function(){ setPref(true); st.screen = ''; st.step = null; st.draft = {}; st.checked = {}; var s = bkLoad(); s._guide = { done:{}, skipped:{}, from:null, assumed:[], confirmed:{} }; bkSave(s); show(); paintToggle(); };
window.bkGuideBlank = function(type){ st.screen = ''; st.step = null; st.draft = {}; if(typeof bkCreateNewDeal === 'function') bkCreateNewDeal(type === 'Development' ? { dealType:'Development', name:'', location:'', closing:'1/1/2027' } : { dealType:'Acquisition', name:'', location:'', closing:'1/1/2027' }); var s = bkLoad(); s._guide = { done:{}, skipped:{}, from:null, assumed:[], confirmed:{} }; if(!String(s.dealId || '').trim() || /^BK-002$/.test(String(s.dealId))) s.dealId = 'NEW-' + Date.now().toString(36).toUpperCase(); bkSave(s); show(); };
window.bkGuideDoc = function(sheet){ if(typeof showSheet === 'function') showSheet(sheet); };
/* a deal has just been created from a document: mark what came from it and what I assumed, then carry on in the guide */
window.bkGuideAfterImport = function(label){ var s = bkLoad(), dev = /develop/i.test(String(s.dealType || '')), keys = []; sections(s).forEach(function(sec){ sec.fields.forEach(function(fl){ var v = s[fl.k]; if(fl.t === 'text' ? String(v || '').trim() : Number(v) > 0) keys.push(fl.k); }); });
  var assumed = (dev ? ['predevMonths', 'constructionMonths', 'leaseupMonths', 'exitCap', 'holdYears', 'rentGrowth', 'opexGrowth', 'saleCostPct', 'conLTC', 'conRate', 'permRate', 'permAmort'] : ['exitCap', 'holdYears', 'closingCostsPct', 'reserves', 'rentGrowth', 'opexGrowth', 'saleCostPct', 'acqLTV', 'acqRate', 'acqAmort', 'acqOrigFee']);
  assumed = assumed.filter(function(k){ return keys.indexOf(k) >= 0 || k === 'reserves'; }); keys = keys.filter(function(k){ return assumed.indexOf(k) < 0; });
  var L = window.__bkOMLast || {}, pages = label === 'OM' && L.sources ? L.sources : null; window.__bkOMLast = null;
  s._guide = { done:{}, skipped:{}, from:{ label:label, keys:keys, pages:pages }, assumed:assumed, confirmed:{} }; bkSave(s); st.step = null; st.draft = {}; st.screen = '';
  if(prefOn()) show(); else if(typeof showSheet === 'function') showSheet('Home'); };

/* ------------------------------------------------------------ chrome: toggle, class, way back */
function paintToggle(){ var host = document.querySelector('.pl-searchwrap'); if(!host) return; var b = document.getElementById('pl-guide-toggle'); if(!b){ b = document.createElement('button'); b.type = 'button'; b.id = 'pl-guide-toggle'; b.setAttribute('onclick', 'bkGuideToggle()'); b.title = 'Step-by-step guide'; host.insertBefore(b, host.firstChild); } var on = prefOn(); b.className = on ? 'on' : ''; b.innerHTML = '<i></i>Guide'; }
function backPill(){ var p = document.getElementById('bk-guide-back'), cs = typeof currentSheet !== 'undefined' ? currentSheet : ''; if(prefOn() && cs !== 'Guide' && active()){ if(!p){ p = document.createElement('button'); p.id = 'bk-guide-back'; p.type = 'button'; p.textContent = '◀ Back to the guide'; p.setAttribute('onclick', 'bkGuideGo(window.bkGuideStep ? bkGuideStep() : null)'); document.body.appendChild(p); } } else if(p) p.remove(); }
window.bkGuideStep = function(){ return st.step; };
document.addEventListener('keydown', function(e){ if(e.key !== 'Enter' || !e.target || !e.target.closest || !e.target.closest('.gd-f') || e.target.type !== 'text') return; e.preventDefault(); var all = [].slice.call(document.querySelectorAll('.gd-f input[type=text]')), i = all.indexOf(e.target); e.target.blur(); var nx = all[i + 1]; if(nx){ nx.focus(); nx.select(); } else { var b = document.getElementById('gd-next'); if(b) b.focus(); } }, true);
var prev = window.showSheet;
window.showSheet = function(sheet){
  if(sheet === 'Home' && prefOn()) sheet = 'Guide';      /* while the guide is on it is the home page */
  var r = prev.call(this, sheet);
  safe(function(){ document.documentElement.classList.toggle('bk-guide', sheet === 'Guide' && prefOn()); backPill(); paintToggle(); if(sheet === 'Guide'){ var sec = secOf(sections(bkLoad()), st.step); if(sec && document.getElementById('gd-imp')) setTimeout(function(){ impact(sec); }, 0); } });
  return r; };
try { showSheet = window.showSheet; } catch(e){}
document.addEventListener('DOMContentLoaded', paintToggle);
var g0 = function(){ return render(); };
if(typeof window.bkRegisterRenderer === 'function') window.bkRegisterRenderer('Guide', g0); else RENDERERS['Guide'] = g0;
var oc = window.bkImportCreate; if(typeof oc === 'function' && !oc.__bkGuide){ window.bkImportCreate = function(){ var r = oc.apply(this, arguments); safe(function(){ window.bkGuideAfterImport('T-12'); }); return r; }; window.bkImportCreate.__bkGuide = true; }
safe(paintToggle);
})();

