
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
  f('vacancy', 'Vacancy', 'pct', { req:1, sug:function(){ return { v:0.05, why:'Stabilised multifamily is usually underwritten at 5%. Use more if the building is not full.' }; } }) ] };
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
  { id:'debt', title:'Financing', why:'The loan changes the return and the risk. Skip it and the returns shown are all-cash.', sheet:'Debt', fields:[ f('debtEnabled', 'Use acquisition debt', 'bool'), f('acqLTV', 'Loan-to-value, max', 'pct', { req:1, sug:function(){ return { v:0.65, why:'Most lenders cap multifamily at 65% to 75%; 65% is a safe starting point.' }; } }), f('acqRate', 'Interest rate', 'pct', { req:1, sug:function(){ return { v:0.0675, why:'A placeholder until you have a lender quote.' }; } }), f('acqAmort', 'Amortisation, years', 'int', { sug:function(){ return { v:30, why:'30 years is standard.' }; } }), f('acqIO', 'Interest-only years', 'num', { help:'0 if none.' }), f('acqOrigFee', 'Origination fee, %', 'pct', { sug:function(){ return { v:0.01, why:'1% is typical.' }; } }) ] },
  EXIT ];
var DEVS = [
  { id:'property', title:'The project', why:'What is being built.', sheet:'Deal Underwrite', fields:[ f('name', 'Name', 'text', { req:1 }), f('location', 'City, state', 'text'), f('units', 'Residential units', 'int', { req:1 }), f('gsf', 'Gross building area, SF', 'int') ] },
  { id:'land', title:'Land and budget', why:'The two big costs. Land is the price; the construction budget is hard and soft costs together.', sheet:'Deal Underwrite', fields:[ f('purchasePrice', 'Land price', 'money', { req:1 }), f('sourceConstruction', 'Construction budget (hard + soft)', 'money', { req:1 }), f('closing', 'Closing date', 'text'),
    f('predevMonths', 'Pre-development, months', 'int', { sug:function(){ return { v:6, why:'Permits and bidding usually take 3 to 9 months.' }; } }), f('constructionMonths', 'Construction, months', 'int', { req:1, sug:function(){ return { v:18, why:'Mid-rise multifamily usually builds in 16 to 24 months.' }; } }), f('leaseupMonths', 'Lease-up, months', 'int', { sug:function(){ return { v:12, why:'New buildings usually lease up in 10 to 16 months.' }; } }) ] },
  INC, EXP(true),
  { id:'debt', title:'Financing', why:'A construction loan, then a permanent loan once the building is stabilised.', sheet:'Debt', fields:[ f('conLTC', 'Construction loan, % of cost', 'pct', { req:1, sug:function(){ return { v:0.65, why:'Construction lenders usually lend 60% to 70% of cost.' }; } }), f('conRate', 'Construction loan rate', 'pct', { req:1, sug:function(){ return { v:0.075, why:'A placeholder until you have a quote.' }; } }), f('permRate', 'Permanent loan rate', 'pct', { sug:function(){ return { v:0.0675, why:'A placeholder until you have a quote.' }; } }), f('permAmort', 'Permanent amortisation, years', 'int', { sug:function(){ return { v:30, why:'30 years is standard.' }; } }) ] },
  EXIT ];
function sections(s){ return /develop/i.test(String((s || bkLoad()).dealType || '')) ? DEVS : ACQ; }

/* ------------------------------------------------------------ values */
function gstate(s){ var g = (s && s._guide) || {}; return { done:g.done || {}, skipped:g.skipped || {}, from:g.from || null, assumed:g.assumed || [], confirmed:g.confirmed || {} }; }
function putG(g){ var s = bkLoad(); s._guide = g; bkSave(s); }
function fmt(fl, v){ if(fl.t === 'bool') return !!v; if(v == null || v === '' || (fl.t !== 'text' && Number(v) === 0)) return ''; if(fl.t === 'pct') return (Math.round(Number(v) * 10000) / 100).toString(); if(fl.t === 'money' || fl.t === 'int') return isFinite(Number(v)) ? Math.round(Number(v)).toLocaleString('en-US') : String(v); return String(v); }
function parse(fl, raw){ raw = String(raw).trim(); if(fl.t === 'text') return raw; var n = parseFloat(raw.replace(/[^0-9.\-]/g, '')); if(!isFinite(n)) return null; return fl.t === 'pct' ? n / 100 : n; }
var SRC = { purchasePrice:'price', units:'units', gsf:'sf', avgRent:'unitMix', name:'name', location:'name' };
function srcPage(g, k){ if(!g.from || !g.from.pages) return null; var key = SRC[k] || 'income'; return g.from.pages[key] || g.from.pages.income || null; }
function money0(n){ return '$' + Math.round(n).toLocaleString('en-US'); }
function cur(s, fl){ return Object.prototype.hasOwnProperty.call(st.draft, fl.k) ? st.draft[fl.k] : s[fl.k]; }
function missing(sec, s){ return sec.fields.filter(function(fl){ if(!fl.req) return false; var v = s[fl.k]; return fl.t === 'text' ? !String(v || '').trim() : !(Number(v) > 0); }); }
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
  var gt = safe(function(){ return bkDealGate(); }, null); if(gt && /DECLINE/i.test(gt.verdict || '') && gt.action) add('review', 'warn', 'The credit gate says decline: ' + gt.action);
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

/* ------------------------------------------------------------ pages */
function css(){ return '<style id="bk-guide-css">html.bk-guide .rail,html.bk-guide .tabnav,html.bk-guide .bk-flow,html.bk-guide .side-col,html.bk-guide .bk-stepnav,html.bk-guide .title-block,html.bk-guide .pl-toolbar{display:none !important}html.bk-guide .shell{grid-template-columns:1fr !important}'
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
  return '<div class="gd-f"><label for="' + id + '">' + esc(fl.label + (fl.t === 'pct' && fl.label.indexOf('%') < 0 ? ' (%)' : '')) + (fl.req ? ' <span style="color:#b23a2c">*</span>' : '') + tag + (fl.help ? '<span class="h">' + esc(fl.help) + '</span>' : '') + '</label>' + input + sugRow + (chk ? '<div style="grid-column:1/-1">' + chk + '</div>' : '') + '</div>';
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
  body += fromNote + advBox + '<div id="gd-imp"></div><div class="gd-card">' + sec.fields.map(function(fl){ return fieldRow(fl, s, g); }).join('') + rr + resultStrip(s, sec) + '</div>' + (sec.id === 'debt' && !/develop/i.test(String(s.dealType || '')) ? '<div id="gd-dbt"></div>' : '');
  body += '<div id="gd-chg"></div>';
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
function refreshChanges(sec){ var s = bkLoad(), rows = changeList(s, sec), el = document.getElementById('gd-chg'), btn = document.getElementById('gd-next'); impact(sec); if(el) el.innerHTML = rows.length ? '<div class="gd-chg"><b>You are about to change</b>' + rows.join('<br>') + '</div>' : ''; if(btn) btn.textContent = rows.length ? 'Confirm ' + rows.length + ' change' + (rows.length === 1 ? '' : 's') + ' and continue' : 'Looks right, continue';
  [].forEach.call(document.querySelectorAll('.gd-f input[type=text]'), function(i){ var k = (i.id || '').replace('gdf-', ''); i.classList.toggle('chg', Object.prototype.hasOwnProperty.call(st.draft, k)); }); }
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
window.bkGuideNext = function(){ var s = bkLoad(), secs = sections(s), sec = secs.filter(function(x){ return x.id === st.step; })[0]; if(!sec) return; apply(sec); st.step = nextId(secs, sec.id); show(); };
window.bkGuideSkip = function(){ var s = bkLoad(), secs = sections(s), sec = secs.filter(function(x){ return x.id === st.step; })[0]; if(!sec) return; var g = gstate(s); g.skipped[sec.id] = 1; delete g.done[sec.id]; s._guide = { done:g.done, skipped:g.skipped, from:g.from, assumed:g.assumed, confirmed:g.confirmed }; bkSave(s); st.draft = {}; st.step = nextId(secs, sec.id); show(); };
window.bkGuideBack = function(){ var s = bkLoad(), secs = sections(s), i = st.step === 'review' ? secs.length : secs.findIndex(function(x){ return x.id === st.step; }); st.draft = {}; st.step = i > 0 ? secs[i - 1].id : secs[0].id; show(); };
window.bkGuideDetail = function(sheet){ document.documentElement.classList.remove('bk-guide'); if(typeof showSheet === 'function') showSheet(sheet); };
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

