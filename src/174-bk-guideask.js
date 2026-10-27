/* ===========================================================================
   ASK THE GUIDE. Type a question in plain words ("where do I change the exit cap", "what is my DSCR", "how do I model NNN recoveries") and get a direction:
   a one-line answer read from the live deal where there is one, the path to the page (Section > Tab > Panel), and a button that takes you there and
   highlights the field. It matches the words you typed against a hand-written list of topics, so it only knows what is in that list; it does not call
   an outside service and it never changes the deal. Where a figure is quoted it comes from the same engine calls the pages use (bkCalc, bkDebt,
   bkMonthlyReturns); nothing is recalculated here.
   =========================================================================== */
(function(){
'use strict';
if(typeof RENDERERS === 'undefined') return;
function safe(f, d){ try { var v = f(); return v === undefined ? d : v; } catch(e){ return d; } }
function esc(v){ return String(v == null ? '' : v).replace(/[&<>"]/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]; }); }
function deal(){ return safe(function(){ return bkLoad(); }, {}) || {}; }
function isDev(s){ return /develop/i.test(String((s || deal()).dealType || '')); }
function pc(v, d){ return v == null || !isFinite(v) ? null : (v * 100).toFixed(d == null ? 2 : d) + '%'; }
function m0(v){ return v == null || !isFinite(v) ? null : '$' + Math.round(v).toLocaleString('en-US'); }
function calc(){ return safe(function(){ return bkCalc(); }, {}) || {}; }
function debt(){ return safe(function(){ return bkDebt(); }, null); }
function ret(){ return safe(function(){ return bkMonthlyReturns(); }, null); }
function now(label, v){ return v ? ' ' + label + ' <b>' + v + '</b>.' : ''; }

/* where each editor tab lives: Section name, tab, sub-tab id (matches bkEditorTabs) */
var ED = { Property:['Property', 'Property'], Market:['Property', 'Market'], Revenues:['Property', 'Revenues'], Expenses:['Property', 'Expenses'], Tenants:['Property', 'Tenants'], Investment:['Property', 'Investment'], Valuation:['Property', 'Valuation'] };
var SUBN = { desc:'Description', loc:'Location', area:'Area Measures', analysis:'Analysis', tpl:'Templates', infl:'Inflation', vac:'General Vacancy', credit:'Credit Loss', lease:'Market Leasing', rent:'Market Rent', res:'Residential Rent', com:'Commercial', oth:'Other Income', misc:'Miscellaneous', op:'Operating', nonop:'Non-Operating', cap:'Capital', grp:'Expense Groups', roll:'Rent Roll', abs:'Space Absorption', coh:'Lease Cohort', acq:'Acquisition', fin:'Financing', dev:'Development', jv:'Partnership', fees:'Fees', exit:'Exit', sum:'Value and Returns' };
function E(tab, sub, field){ return { sheet:tab, tab:tab, sub:sub, field:field || null, path:['Property', tab, SUBN[sub]] }; }
function P(sheet, panel, path){ return { sheet:sheet, panel:panel || null, path:path || [sheet].concat(panel ? [panel] : []) }; }

/* k: phrases (every word of a phrase in the question scores it); a: answer text or a function of the deal; go: where it lives; dev/acq: only meaningful for that deal type */
var T = [];
function add(title, k, a, go, o){ T.push(Object.assign({ title:title, k:k, a:a, go:go }, o || {})); }

/* ---- the deal */
add('Purchase price', ['purchase price', 'price', 'what we pay', 'acquisition price', 'land price'], function(s){ return 'The purchase price is set on Investment > Acquisition.' + now('It is now', m0(Number(s.purchasePrice))); }, E('Investment', 'acq', 'ae-purchasePrice'));
add('Closing costs', ['closing costs', 'diligence costs', 'legal title'], 'Closing and diligence costs are a percent of price on Investment > Acquisition.', E('Investment', 'acq', 'ae-closingCostsPct'));
add('Units and square feet', ['units', 'unit count', 'square feet', 'sf', 'gross building area', 'gsf'], 'Unit count and building area are on Property > Area Measures.', E('Property', 'area', 'ae-units'));
add('Hold period', ['hold period', 'length of analysis', 'how long hold', 'years hold', 'analysis years'], function(s){ return 'The hold is the Length of Analysis on Property > Analysis.' + now('It is now', s.holdYears ? s.holdYears + ' years' : null); }, E('Property', 'analysis', 'ae-holdYears'));
add('Closing date', ['closing date', 'purchase date', 'analysis begin', 'start date'], 'The analysis begins on the purchase date, set on Property > Analysis.', E('Property', 'analysis', 'ae-closing'));
add('Case (Base, Downside, Upside)', ['case', 'scenario', 'downside', 'upside', 'base case'], 'The case selector is in the page header (CASE) and on Property > Analysis. The Sensitivity page compares all three side by side.', E('Property', 'analysis'));
add('Deal type (acquisition or development)', ['deal type', 'development deal', 'acquisition deal', 'change type'], 'Deal Type is on Property > Description. It decides which sections and guide steps you see.', E('Property', 'desc'));

/* ---- income */
add('Average rent', ['average rent', 'rent per unit', 'residential rent', 'avg rent', 'monthly rent'], function(s){ return 'Average rent per unit per month is on Revenues > Residential Rent.' + now('It is now', m0(Number(s.avgRent))); }, E('Revenues', 'res', 'ae-avgRent'));
add('Retail / commercial rent', ['retail rent', 'commercial rent', 'ground floor retail', 'base rent', 'retail income'], 'Flat retail rent is on Revenues > Commercial. For tenant-by-tenant leases, switch Retail Income Comes From to the tenant schedule on Tenants > Commercial Leases.', E('Revenues', 'com', 'ae-commercialRent'));
add('Other income', ['other income', 'laundry', 'parking income', 'fees income', 'bill back'], 'Other income per unit per year is on Revenues > Other Income.', E('Revenues', 'oth', 'ae-otherIncomePerUnit'));
add('Vacancy', ['vacancy', 'occupancy', 'vacant'], function(s){ return 'Residential vacancy is on Market > General Vacancy; retail vacancy sits beside it.' + now('Residential vacancy is now', pc(Number(s.vacancy), 1)); }, E('Market', 'vac', 'ae-vacancy'));
add('Credit loss / bad debt', ['bad debt', 'credit loss', 'collection loss'], 'Bad debt is a percent on Market > Credit Loss, and you choose what it is charged on.', E('Market', 'credit', 'ae-badDebtPct'));
add('Rent and expense growth', ['rent growth', 'growth', 'inflation', 'escalation', 'annual increase', 'expense growth', 'cpi'], 'Rent and expense growth rates are by year on Market > Inflation. Year 1 is at the entered figures; growth starts in year 2.', E('Market', 'infl'));
add('Market rent and loss to lease', ['market rent', 'loss to lease', 'in place rent'], 'In-place versus market rent from the rent roll is on Market > Market Rent.', E('Market', 'rent'));

/* ---- expenses */
add('Operating expenses', ['operating expenses', 'expenses', 'opex', 'taxes', 'insurance', 'payroll', 'utilities', 'repairs', 'management fee', 'property management'], function(s){ var c = calc(), r = c.egi && c.noi ? pc(1 - c.noi / c.egi, 0) : null; return 'Operating expense lines are on Expenses > Operating.' + (r ? ' Expenses are about <b>' + r + '</b> of income.' : ''); }, E('Expenses', 'op'));
add('Asset management fee', ['asset management fee', 'asset mgmt'], 'The asset management fee is on Expenses > Non-Operating (and summarised on Investment > Fees).', E('Expenses', 'nonop', 'ae-assetMgmtPct'));
add('Reserves and capital items', ['reserves', 'replacement reserves', 'capex', 'capital expenditure', 'renovation', 'roof'], 'Reserves and one-off capital items are on Expenses > Capital.', E('Expenses', 'cap'));
add('NOI', ['noi', 'net operating income'], function(){ var c = calc(); return 'NOI is calculated from income less operating expenses; it is not typed in.' + now('Year-1 NOI is', m0(c.noi)); }, P('Operating Underwrite', null, ['Property Operations', 'Operating Underwrite']));
add('Property cash flow', ['property cash flow', 'cash flow', 'annual cash flow', 'cf by year'], 'The year-by-year property cash flow is on Property Operations > Property CF.', P('Property CF', null, ['Property Operations', 'Property CF']));

/* ---- tenants and leases */
add('Rent roll', ['rent roll', 'unit mix', 'unit by unit', 'tenant roll'], 'The unit-by-unit rent roll is on Property > Tenants > Rent Roll. Import one from a spreadsheet on Inputs > Import Rent Roll.', E('Tenants', 'roll'));
add('Import a rent roll', ['import rent roll', 'upload rent roll', 'load rent roll'], 'Import Rent Roll reads a spreadsheet and maps its columns, including NNN lease terms.', P('Import Rent Roll', null, ['Inputs', 'Import Rent Roll']));
add('Commercial leases and NNN recoveries', ['nnn', 'triple net', 'recoveries', 'expense stop', 'tenant lease', 'commercial lease', 'cam', 'base year', 'expense reimbursement', 'lease model'], 'Tenant-by-tenant leases, recoveries (NNN, modified gross, base year, expense stops) and caps are on Tenants > Commercial Leases. Turn the lease model on by adding a tenant or building them from the commercial rent roll.', E('Tenants', 'lease'));
add('Lease expirations, rollover, TI and commissions', ['rollover', 'renewal', 'tenant improvements', 'ti', 'leasing commission', 'downtime', 'free rent', 'lease expiry', 'rollover assumptions'], 'Renewal probability, downtime, TI, commissions and free rent are the market leasing assumptions on Market > Market Leasing (the same panel sits on Tenants > Commercial Leases).', E('Market', 'lease', 'ae-rolloverAssumptions-renewalProbability'));
add('Lease schedule report', ['lease schedule', 'tenant schedule report', 'rent by tenant'], 'The tenant-by-tenant schedule report is under Reports > Lease Schedule. It stays empty until the commercial lease model is on.', P('Lease Schedule', null, ['Reports', 'Lease Schedule']), { optional:true });
add('Lease-up', ['lease up', 'leaseup', 'absorption', 'pre leased', 'lease up months', 'ramp'], 'Lease-up length, absorption and pre-leasing are on Tenants > Space Absorption. Development deals can lease up unit by unit on Development > Dev Lease-Up.', E('Tenants', 'abs', 'ae-leaseupMonths'));

/* ---- development */
add('Development schedule (Gantt)', ['gantt', 'schedule', 'construction schedule', 'timeline', 'milestones', 'critical path', 'predevelopment'], 'The development schedule and Gantt chart are on Development > Dev Schedule. They set pre-development and construction months.', P('Dev Schedule', null, ['Development', 'Dev Schedule']), { dev:true });
add('Unit-by-unit lease-up (development)', ['dev lease up', 'unit lease up', 'unit mix lease up', 'absorption by unit'], 'Unit-level lease-up for a development deal is on Development > Dev Lease-Up.', P('Dev Lease-Up', null, ['Development', 'Dev Lease-Up']), { dev:true });
add('Construction draws and curves', ['draws', 'construction draws', 's curve', 'straight line', 'cost curve', 'draw curve', 'steepness'], 'Construction draw timing (straight-line or S-curve with a steepness setting) is on Development > Dev Draws.', P('Dev Draws', null, ['Development', 'Dev Draws']), { dev:true });
add('Residual land value', ['residual land', 'land value', 'land residual', 'max land price', 'what can we pay for land'], 'Residual land value solves the land price that hits a target return. It is on Development > Residual Land.', P('Residual Land', null, ['Development', 'Residual Land']), { dev:true });
add('Development budget', ['development budget', 'construction budget', 'hard costs', 'soft costs', 'project budget', 'total cost'], 'The construction budget, hard and soft costs, and timing are on Development > Development and Property > Investment > Development.', P('Development', null, ['Development', 'Development']), { dev:true });

/* ---- debt */
add('Loan to value / cost', ['ltv', 'loan to value', 'ltc', 'loan to cost', 'leverage', 'how much debt'], function(s){ var d = debt(); return 'Maximum LTV and LTC are on Property > Investment > Financing.' + now('The loan is', d && d.loan ? m0(d.loan) : null) + (d && d.binding ? ' It is sized by <b>' + d.binding + '</b>.' : ''); }, E('Investment', 'fin', 'ae-acqLTV'));
add('DSCR and debt yield', ['dscr', 'debt service coverage', 'coverage', 'debt yield'], function(){ var d = debt(); return 'Minimum DSCR and debt yield are on Property > Investment > Financing.' + now('Year-1 DSCR is', d && d.dscr ? d.dscr.toFixed(2) + 'x' : null); }, E('Investment', 'fin', 'ae-acqDSCR'));
add('Interest rate', ['interest rate', 'rate', 'coupon', 'loan rate'], function(s){ return 'The acquisition loan rate is on Property > Investment > Financing.' + now('It is now', pc(Number(s.acqRate), 2)); }, E('Investment', 'fin', 'ae-acqRate'));
add('Amortization and interest-only', ['amortization', 'amort', 'interest only', 'io period', 'loan term'], 'Amortization and the interest-only period are on Property > Investment > Financing.', E('Investment', 'fin', 'ae-acqAmort'));
add('Which loan constraint binds', ['binding constraint', 'loan sizing', 'sized by', 'which constraint', 'max loan', 'loan proceeds'], function(){ var d = debt(); return 'The Debt page shows each sizing test and which one limits the loan.' + now('Right now the loan is', d && d.loan ? m0(d.loan) : null) + (d && d.binding ? ' limited by <b>' + d.binding + '</b>.' : ''); }, P('Debt', 'Sizing Constraints', ['Debt', 'Sizing Constraints']));
add('Maturity and balloon', ['maturity', 'balloon', 'refinance risk'], 'Balloon and maturity risk are on Debt > Maturity.', P('Debt', 'Maturity', ['Debt', 'Maturity']));
add('Refinance', ['refinance', 'refi', 'recap', 'permanent loan', 'take out'], 'Refinance and permanent loan sizing are on Debt > Refinance; the full analysis is on Debt > Refi / Recap.', P('Debt', 'Refinance', ['Debt', 'Refinance']));
add('Debt schedule', ['debt schedule', 'loan balance', 'amortization schedule', 'payment schedule'], 'The month-by-month loan balance and payments are on Debt > Debt Schedule.', P('Debt Schedule', null, ['Debt', 'Debt Schedule']));
add('Covenants', ['covenant', 'covenants', 'lender test', 'cash sweep'], 'Covenant tests over the hold are on Debt > Covenant Monitor.', P('Covenant Monitor', null, ['Debt', 'Covenant Monitor']));
add('Debt capacity and credit policy', ['debt capacity', 'credit policy', 'house policy', 'credit box', 'policy test'], 'The house credit box and what debt the deal can carry are on Credit & IC > Debt Capacity and Credit Policy.', P('Debt Capacity', null, ['Credit & IC', 'Debt Capacity']));

/* ---- exit and returns */
add('Exit cap rate', ['exit cap', 'terminal cap', 'sale cap', 'reversion cap', 'cap rate at sale', 'residual cap'], function(s){ return 'The exit cap rate is on Property > Valuation > Exit. Sale price is forward NOI divided by it.' + now('It is now', pc(Number(s.exitCap), 2)); }, E('Valuation', 'exit', 'ae-exitCap'));
add('Going-in cap rate', ['going in cap', 'cap rate', 'entry cap', 'purchase cap', 'yield on cost', 'broker cap'], function(s){ var c = calc(), p = Number(s.purchasePrice); return 'The going-in cap rate is calculated as year-1 NOI divided by price; a broker’s quoted cap rate is never used in its place. Yield on cost for development is on Reverse Solve.' + (c.noi && p ? ' Calculated now: <b>' + pc(c.noi / p, 2) + '</b>.' : ''); }, P('Returns', null, ['Returns & Equity', 'Returns']));
add('Cost of sale', ['cost of sale', 'sale costs', 'selling costs', 'disposition cost', 'broker fee at sale'], 'Cost of sale is a percent of price on Property > Valuation > Exit.', E('Valuation', 'exit', 'ae-saleCostPct'));
add('IRR and equity multiple', ['irr', 'return', 'returns', 'equity multiple', 'moic', 'multiple', 'levered irr', 'how good is this deal', 'profit'], function(){ var r = ret(); return 'Headline returns are on Returns & Equity > Returns.' + (r && isFinite(r.irr) ? ' Levered IRR is <b>' + pc(r.irr, 1) + '</b>, equity multiple <b>' + r.moic.toFixed(2) + 'x</b>.' : ''); }, P('Returns', 'Return Summary', ['Returns & Equity', 'Returns']));
add('Sensitivity tables', ['sensitivity', 'what if', 'sensitivities', 'stress', 'tornado', 'break even'], 'One-way and two-way sensitivity tables (exit cap, rent growth, price, rate, vacancy, hold) are on Tools > Sensitivity. Break-even cushions are on Credit & IC > IC Memo.', P('Sensitivity', null, ['Tools', 'Sensitivity']));
add('Solve for a price or a rent', ['reverse solve', 'back solve', 'target irr', 'what price', 'max price', 'solve for', 'required rent', 'price hit', 'pay hit', 'price target', 'price pay'], 'Reverse Solve finds the price (or rent) that hits a target return. It is on Tools > Reverse Solve.', P('Reverse Solve', null, ['Tools', 'Reverse Solve']));
add('Pre-offer bid', ['bid', 'offer price', 'pre offer', 'prebid'], 'The pre-offer bid helper is on Returns & Equity > Pre-Offer Bid.', P('Pre-Offer Bid', null, ['Returns & Equity', 'Pre-Offer Bid']));
add('After-tax returns', ['after tax', 'depreciation', 'tax', 'macrs', 'cost segregation'], 'After-tax returns are on Returns & Equity > After-Tax; the depreciation setup is on Inputs > Depreciation.', P('After-Tax', null, ['Returns & Equity', 'After-Tax']));
add('Sell versus hold', ['sell vs hold', 'sell or hold', 'hold or sell'], 'Sell vs Hold compares selling now with holding, under Operating Business.', P('Sell vs Hold', null, ['Operating Business', 'Sell vs Hold']));
add('Sources and uses', ['sources and uses', 'sources uses', 'capital stack', 'capitalization', 's&u'], 'Sources and Uses is its own page (totals, per unit, per SF, funding order).', P('Sources & Uses', null, ['Database', 'Sources & Uses']));

/* ---- partnership and investors */
add('Preferred return and hurdles', ['preferred return', 'pref', 'hurdle', 'hurdles', 'tier', 'promote', 'carried interest'], 'The preferred return, hurdles and promote splits are on Property > Investment > Partnership.', E('Investment', 'jv', 'ae-pref'));
add('GP and LP equity share', ['gp share', 'sponsor equity', 'co invest', 'gp equity', 'lp equity', 'partnership split', 'equity split'], 'The GP / Sponsor equity share is on Property > Investment > Partnership.', E('Investment', 'jv', 'ae-gpShare'));
add('GP catch-up', ['catch up', 'catchup', 'gp catch up'], 'The GP catch-up setting and target are on Property > Investment > Partnership.', E('Investment', 'jv', 'ae-gpCatchupTarget'));
add('Fees to the sponsor', ['acquisition fee', 'disposition fee', 'sponsor fee', 'fees'], 'Acquisition, asset management and disposition fees are on Property > Investment > Fees.', E('Investment', 'fees', 'ae-acqFeePct'));
add('Equity waterfall', ['waterfall', 'distribution', 'distributions', 'who gets paid', 'lp gp split', 'lp returns', 'gp returns'], 'The distribution waterfall and partner returns are on Returns & Equity > Equity Waterfall.', P('Equity Waterfall', null, ['Returns & Equity', 'Equity Waterfall']));
add('Sponsor cash flow', ['sponsor cash flow', 'sponsor cf', 'sponsor irr', 'gp cash flow', 'promote cash'], 'Sponsor fees, promote and co-invest cash flow are on Monthly Engine > Sponsor CF.', P('Sponsor CF', null, ['Monthly Engine', 'Sponsor CF']));
add('Investors', ['investors', 'investor', 'commitments', 'capital calls', 'investor register'], 'The investor registry and commitments are on Portfolio & Investors > Investors.', P('Investors', null, ['Portfolio & Investors', 'Investors']));

/* ---- review, credit, reports, data in and out */
add('IC memo and credit gate', ['ic memo', 'investment committee', 'credit gate', 'approval', 'decline', 'risk register', 'conditions precedent'], 'The IC memo, credit gate, ranked exceptions and sign-off are on Credit & IC > IC Memo.', P('IC Memo', null, ['Credit & IC', 'IC Memo']));
add('Model checks', ['model checks', 'errors', 'check the model', 'audit', 'does it tie', 'reconcile', 'tie out'], 'Model Checks runs the integrity tests (balances, ties, ranges) and lists any that fail.', P('Model Checks', null, ['Credit & IC', 'Model Checks']));
add('Remedies for a failing deal', ['remedies', 'fix the deal', 'make it work', 'what would fix', 'deal remedies'], 'Deal Remedies shows what change would get a failing test back inside policy.', P('Deal Remedies', null, ['Credit & IC', 'Deal Remedies']));
add('Import an offering memorandum', ['import om', 'offering memorandum', 'om', 'pdf import', 'upload om', 'broker package'], 'Import OM reads an offering memorandum PDF and creates a deal from it, showing what came from which page.', P('Import OM', null, ['Inputs', 'Import OM']));
add('Import a T-12', ['import t12', 't 12', 't12', 'trailing twelve', 'operating statement', 'import deal'], 'Import Deal creates a deal from a trailing-12 or operating statement spreadsheet.', P('Import Deal', null, ['Inputs', 'Import Deal']));
add('Documents', ['documents', 'deal documents', 'attach pdf', 'files'], 'Deal Documents stores the PDFs and spreadsheets attached to a deal.', P('Deal Documents', null, ['Inputs', 'Deal Documents']));
add('Print or PDF report', ['pdf', 'print', 'report', 'export report', 'deal summary pdf', 'download'], 'Use the Print / PDF action on the Returns page (or your browser print). The report carries the summary, cash flow and waterfall pages, with every panel included.', P('Returns', null, ['Returns & Equity', 'Returns']));
add('Export data', ['export', 'excel', 'csv', 'data export', 'download data'], 'Data Export writes the deal and portfolio tables out to a file.', P('Data Export', null, ['Portfolio & Investors', 'Data Export']));
add('Portfolio', ['portfolio', 'saved deals', 'compare deals', 'all deals', 'save deal'], 'Saved deals and the portfolio roll-up are on Portfolio & Investors > Portfolio.', P('Portfolio', null, ['Portfolio & Investors', 'Portfolio']));
add('Business valuation', ['business valuation', 'operating business', 'business model', 'ebitda'], 'Operating-business models and their valuation are under Operating Business.', P('Business Valuation', null, ['Operating Business', 'Business Valuation']));
add('Market benchmarks', ['benchmarks', 'market benchmarks', 'is this reasonable', 'market comps', 'typical'], 'Market Benchmarks compares your assumptions with typical ranges.', P('Market Benchmarks', null, ['Inputs', 'Market Benchmarks']));
add('Probability-weighted returns', ['probability', 'probability weighted', 'expected return', 'weighted scenarios'], 'Probability-weighted returns across the three cases are on Returns & Equity > Probability-Weighted.', P('Probability-Weighted', null, ['Returns & Equity', 'Probability-Weighted']));
add('The step-by-step guide itself', ['guide', 'step by step', 'walk me through', 'help', 'where do i start', 'getting started', 'start'], 'The guide walks the essentials one section at a time. It writes nothing until you confirm each step.', P('Guide', null, ['Guide']));
add('The hidden SYS_ sheets', ['sys', 'sys engine', 'backend', 'engine sheets', 'sys_'], 'The SYS_ pages explain how the old workbook’s hidden calculation sheets map onto this app’s engines. They are hidden from the menu and compute nothing.', P('SYS_DealDB', null, ['SYS_ Engine']));

/* ------------------------------------------------------------ matching */
var STOP = { a:1, an:1, the:1, is:1, are:1, was:1, do:1, does:1, did:1, i:1, we:1, my:1, me:1, you:1, it:1, its:1, to:1, of:1, in:1, on:1, at:1, for:1, and:1, or:1, how:1, what:1, where:1, which:1, can:1, should:1, would:1, find:1, change:1, set:1, show:1, see:1, view:1, get:1, put:1, enter:1, edit:1, this:1, that:1, there:1, deal:1, model:1, please:1, tell:1, about:1, much:1, many:1, go:1, need:1, want:1, make:1, use:1, with:1, from:1, by:1, be:1, am:1, so:1 };
function stem(w){ if(w.length > 4 && /ies$/.test(w)) return w.slice(0, -3) + 'y'; if(w.length > 4 && /(ing|ed)$/.test(w)) return w.replace(/(ing|ed)$/, ''); if(w.length > 3 && /s$/.test(w) && !/ss$/.test(w)) return w.slice(0, -1); return w; }
function toks(t){ return String(t || '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').split(' ').filter(function(w){ return w && !STOP[w]; }).map(stem); }
function scoreTopic(t, q){
  var qs = {}, n = 0; q.forEach(function(w){ qs[w] = 1; n++; }); var best = 0;
  t.k.forEach(function(ph){ var pt = toks(ph).filter(function(w){ return w; }); if(!pt.length) return; var hit = pt.filter(function(w){ return qs[w]; }).length;
    if(hit === pt.length){ best = Math.max(best, 10 + pt.length * 3); }
    else if(hit && pt.length > 1 && hit >= pt.length - 1 && hit >= 2) best = Math.max(best, 6 + hit); });
  var tt = toks(t.title), th = tt.filter(function(w){ return qs[w]; }).length; if(th) best += th * 2;
  return best;
}
function ask(question){
  var q = toks(question); if(!q.length) return [];
  return T.map(function(t){ return { t:t, s:scoreTopic(t, q) }; }).filter(function(z){ return z.s >= 8; }).sort(function(a, b){ return b.s - a.s; }).slice(0, 3).map(function(z){ return z.t; });
}
function answerOf(t){ var s = deal(), a = typeof t.a === 'function' ? safe(function(){ return t.a(s); }, '') : t.a; var note = ''; if(t.dev && !isDev(s)) note = ' <i>(This is a development-deal page; the open deal is an acquisition.)</i>'; return a + note; }

/* ------------------------------------------------------------ going there */
function flash(el){ if(!el) return; try { el.scrollIntoView({ block:'center' }); } catch(e){} el.classList.add('bk-ask-flash'); setTimeout(function(){ el.classList.remove('bk-ask-flash'); }, 3200); }
function arrive(go, tries){
  var done = true;
  if(go.panel && typeof window.bkPanelTabsOpen === 'function'){
    var act = typeof window.bkPanelTabsActive === 'function' ? window.bkPanelTabsActive() : null;
    var main = document.querySelector('#viewport .main-col'), bar = main && main.querySelector(':scope > .bk-pt-bar');
    if(bar){ var rx = new RegExp(go.panel, 'i'), tabs = [].slice.call(bar.querySelectorAll('.ae-tab:not(.bk-pt-all)')), i = -1; tabs.forEach(function(t, k){ if(i < 0 && rx.test(t.textContent)) i = k; });
      if(i >= 0){ if(act === null){ var pane = main.querySelector(':scope > .bk-pt-pane[data-i="' + i + '"]'); flash(pane); } else window.bkPanelTabsOpen(rx); } }
    else if(tries < 8) done = false;
  }
  if(go.field){ var f = document.getElementById(go.field); if(f) flash(f.closest('label,div,td') || f); else if(tries < 8) done = false; }
  if(!done) setTimeout(function(){ arrive(go, tries + 1); }, 150);
}
function take(i){
  var t = window.__bkAskLast && window.__bkAskLast[i]; if(!t) return; var go = t.go, o = document.getElementById('bk-ask-pop'); if(o) o.classList.remove('open');
  if(typeof RENDERERS !== 'undefined' && !RENDERERS[go.sheet]){ return; }
  if(go.tab && typeof window.bkEdGo === 'function') window.bkEdGo(go.sheet, go.tab, go.sub); else if(typeof showSheet === 'function') showSheet(go.sheet);
  setTimeout(function(){ arrive(go, 0); }, 200);
}

/* ------------------------------------------------------------ the box */
var EXAMPLES = ['Where do I change the exit cap?', 'What is my DSCR?', 'How do I model NNN recoveries?', 'Where is the waterfall?'];
function resultsHtml(q){
  var hits = ask(q); window.__bkAskLast = hits;
  if(!String(q || '').trim()) return '';
  if(!hits.length) return '<div class="bk-ask-card"><b>I couldn’t match that.</b> I only know the topics on my list, and I don’t search your data. Try one or two key words, such as <i>exit cap</i>, <i>vacancy</i>, <i>waterfall</i>, <i>DSCR</i> or <i>rent roll</i>.</div>';
  return hits.map(function(t, i){ return '<div class="bk-ask-card"><div class="bk-ask-t">' + esc(t.title) + '</div><div class="bk-ask-a">' + answerOf(t) + '</div><div class="bk-ask-p">' + t.go.path.map(esc).join(' › ') + '</div><button type="button" class="bk-ask-go" data-i="' + i + '">Take me there</button></div>'; }).join('');
}
function boxHtml(id){ return '<div class="bk-ask" id="' + id + '"><label class="bk-ask-l" for="' + id + '-q">Ask the guide</label><div class="bk-ask-r"><input type="text" id="' + id + '-q" class="bk-ask-q" placeholder="Ask where something is, or what a number is…" autocomplete="off" spellcheck="false"><button type="button" class="bk-ask-b" data-box="' + id + '">Ask</button></div><div class="bk-ask-ex">' + EXAMPLES.map(function(e){ return '<a href="#" data-q="' + esc(e) + '" data-box="' + id + '">' + esc(e) + '</a>'; }).join('') + '</div><div class="bk-ask-res" id="' + id + '-res" aria-live="polite"></div></div>'; }
function run(id, q){ var inp = document.getElementById(id + '-q'), res = document.getElementById(id + '-res'); if(!inp || !res) return; if(q != null) inp.value = q; res.innerHTML = resultsHtml(inp.value); }
window.bkAsk = function(q){ return ask(q).map(function(t){ return { title:t.title, answer:answerOf(t).replace(/<[^>]+>/g, ''), path:t.go.path.slice(), go:t.go }; }); };
window.bkAskTopics = function(){ return T.map(function(t){ return { title:t.title, go:t.go, optional:!!t.optional }; }); };
window.bkAskGo = function(go){ window.__bkAskLast = [{ go:go }]; take(0); };

var css = '.bk-ask{margin:0 0 16px;padding:14px 16px;border:1px solid var(--line,#b9c3ce);border-left:4px solid #3e9ae6;border-radius:8px;background:var(--surface,#fff)}.bk-ask-l{display:block;font-weight:700;font-size:13px;margin-bottom:6px}.bk-ask-r{display:flex;gap:8px}.bk-ask-q{flex:1;min-width:0;font:inherit;font-size:14px;padding:9px 11px;border:1px solid var(--line,#b9c3ce);border-radius:6px;background:var(--bg,#fff);color:inherit}.bk-ask-b,.bk-ask-go{font:inherit;font-weight:600;font-size:13px;padding:8px 14px;border:0;border-radius:6px;background:#3e6fb0;color:#fff;cursor:pointer}'
 + '.bk-ask-ex{display:flex;flex-wrap:wrap;gap:6px 14px;margin-top:8px;font-size:12px}.bk-ask-ex a{color:#3e6fb0;text-decoration:underline;cursor:pointer}.bk-ask-res{margin-top:10px}.bk-ask-card{padding:10px 12px;margin-top:8px;border:1px solid var(--line,#d3dae2);border-radius:6px}.bk-ask-t{font-weight:700;font-size:14px}.bk-ask-a{font-size:13px;margin:4px 0;line-height:1.45}.bk-ask-p{font-size:11px;letter-spacing:.04em;text-transform:uppercase;opacity:.65;margin-bottom:8px}'
 + '.bk-ask-flash{outline:3px solid #f0b429 !important;outline-offset:3px;animation:bkAskFl 3.2s ease-out}@keyframes bkAskFl{0%{background-color:rgba(240,180,41,.35)}100%{background-color:transparent}}'
 + '#bk-ask-fab{position:fixed;left:18px;bottom:62px;z-index:80;border:0;border-radius:999px;padding:9px 16px;font:inherit;font-weight:600;font-size:13px;background:#3e6fb0;color:#fff;box-shadow:0 4px 14px rgba(0,0,0,.3);cursor:pointer}'
 + '#bk-ask-pop{position:fixed;inset:0;z-index:2100;background:rgba(10,16,22,.55);display:none;align-items:flex-start;justify-content:center;padding-top:10vh}#bk-ask-pop.open{display:flex}#bk-ask-pop .box{width:min(620px,92vw);max-height:80vh;overflow-y:auto;background:var(--surface,#fff);color:var(--ink,#1c2833);border-radius:12px;padding:6px}#bk-ask-pop .bk-ask{margin:8px;border-left-width:1px}'
 + '@media print{#bk-ask-fab,#bk-ask-pop{display:none !important}.bk-ask-flash{outline:0 !important;animation:none}}@media (max-width:760px){.bk-ask-r{flex-direction:column}#bk-ask-fab{bottom:60px}}';
var st = document.createElement('style'); st.id = 'bk-ask-css'; st.textContent = css; document.head.appendChild(st);

document.addEventListener('click', function(e){
  var t = e.target; if(!t || !t.closest) return;
  var go = t.closest('.bk-ask-go'); if(go){ take(Number(go.getAttribute('data-i'))); return; }
  var b = t.closest('.bk-ask-b'); if(b){ run(b.getAttribute('data-box')); return; }
  var ex = t.closest('.bk-ask-ex a'); if(ex){ e.preventDefault(); run(ex.getAttribute('data-box'), ex.getAttribute('data-q')); return; }
  if(t.closest('#bk-ask-fab')){ openPop(); return; }
  var pop = document.getElementById('bk-ask-pop'); if(pop && t === pop) pop.classList.remove('open');
});
document.addEventListener('keydown', function(e){
  var t = e.target; if(!t || !t.classList || !t.classList.contains('bk-ask-q')) return;
  if(e.key === 'Enter'){ e.preventDefault(); run(t.id.replace(/-q$/, '')); }
  else if(e.key === 'Escape'){ var pop = document.getElementById('bk-ask-pop'); if(pop) pop.classList.remove('open'); }
});
function openPop(){ var pop = document.getElementById('bk-ask-pop'); if(!pop){ pop = document.createElement('div'); pop.id = 'bk-ask-pop'; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'Ask the guide'); pop.innerHTML = '<div class="box">' + boxHtml('bk-ask-p') + '</div>'; document.body.appendChild(pop); }
  pop.classList.add('open'); var q = document.getElementById('bk-ask-p-q'); if(q){ q.value = ''; document.getElementById('bk-ask-p-res').innerHTML = ''; setTimeout(function(){ q.focus(); }, 0); } }
window.bkAskOpen = openPop;

/* the box sits at the top of the Guide page; while the guide is on, a button on every other page opens the same box */
var g0 = RENDERERS['Guide'];
if(typeof g0 === 'function'){ var wrapped = function(){ var h = g0.apply(this, arguments); if(h && typeof h.main === 'string') h.main = boxHtml('bk-ask-g') + h.main; return h; };
  if(typeof window.bkRegisterRenderer === 'function') window.bkRegisterRenderer('Guide', wrapped); else RENDERERS['Guide'] = wrapped; }
function fab(){
  var on = safe(function(){ return typeof window.bkGuideActive === 'function' && window.bkGuideActive(); }, false), cs = safe(function(){ return currentSheet; }, ''), b = document.getElementById('bk-ask-fab');
  var want = on && cs !== 'Guide' && cs !== 'Home'; if(want && !b){ b = document.createElement('button'); b.type = 'button'; b.id = 'bk-ask-fab'; b.textContent = 'Ask the guide'; document.body.appendChild(b); } else if(!want && b) b.remove();
}
var prev = window.showSheet;
if(typeof prev === 'function'){ window.showSheet = function(sheet){ var r = prev.apply(this, arguments); setTimeout(fab, 60); return r; }; try { showSheet = window.showSheet; } catch(e){} }
setTimeout(fab, 300);
})();
