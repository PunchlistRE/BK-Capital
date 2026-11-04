/* ANALYSIS REGISTRY - SUMMARIES. One metric dictionary; each analysis's summary is an ordered list of metric ids with the primary output first.
   A metric reads the engines through one context object (computed once per summary), so the on-screen summary and the PDF executive summary, which both
   call BKReg.summarize, cannot show different figures. A metric returns null when the input it needs is missing; it is shown as missing, never as zero.
   planned: belongs to an analysis not built yet; no live analysis may lead with it. */
(function(){
'use strict';
if(!window.BKReg) return;
var R = window.BKReg;
function safe(f, d){ try { var v = f(); return v === undefined ? d : v; } catch(e){ return d; } }
function fin(v){ return typeof v === 'number' && isFinite(v) ? v : null; }
function pos(v){ v = fin(v); return v !== null && v !== 0 ? v : null; }
function M(id, label, fmt, get, o){ return Object.assign({ id:id, label:label, fmt:fmt, get:get }, o || {}); }
function P(id, label, fmt){ return M(id, label, fmt, function(){ return null; }, { planned:true }); }
/* the engines, each run at most once for a summary */
function ctx(s){ var c = { s:s }, memo = {};
  var lazy = function(k, f){ Object.defineProperty(c, k, { get:function(){ if(!(k in memo)) memo[k] = safe(f, null); return memo[k]; } }); };
  lazy('calc', function(){ return bkCalc(); }); lazy('debt', function(){ return bkDebt(); }); lazy('ret', function(){ return bkMonthlyReturns(); }); lazy('acf', function(){ return bkAnnualCF(); });
  lazy('dev', function(){ return bkDevV09(); }); lazy('fund', function(){ return bkDevFundingV10(); }); lazy('take', function(){ return bkDevTakeoutV11(); });
  return c; }
var price = function(c){ return pos(Number(c.s.purchasePrice)); };
R.addMetrics([
  /* shared operating */
  M('gpi', 'Gross potential income', 'money', function(c){ var k = c.calc; return k ? pos(k.gpr + k.commercial + k.recovery + k.other) : null; }),
  M('egi', 'Effective gross income', 'money', function(c){ return c.calc ? pos(c.calc.egi) : null; }),
  M('opex', 'Operating expenses', 'money', function(c){ return c.calc ? pos(c.calc.total) : null; }),
  M('noiInPlace', 'In-place NOI (before reserves)', 'money', function(c){ return c.calc ? fin(c.calc.noi) : null; }),
  /* acquisition */
  M('price', 'Purchase price', 'money', function(c){ return price(c); }),
  M('totalCost', 'Total acquisition cost', 'money', function(c){ return c.acf ? pos(-c.acf.initial) : null; }, { note:'price, closing costs and acquisition fee' }),
  M('equity', 'Equity required', 'money', function(c){ return c.debt ? pos(c.debt.equity) : null; }),
  M('loan', 'Loan', 'money', function(c){ return c.debt && c.s.debtEnabled !== false ? fin(c.debt.loan) : null; }),
  M('ltv', 'Loan to value', 'pct', function(c){ return c.debt && c.s.debtEnabled !== false ? fin(c.debt.ltv) : null; }),
  M('dscr', 'Going-in DSCR', 'x', function(c){ return c.debt && c.s.debtEnabled !== false ? fin(c.debt.dscr) : null; }),
  M('goingInCap', 'Going-in cap rate', 'pct', function(c){ var p = price(c); return p && c.calc ? fin(c.calc.noi / p) : null; }),
  M('cashOnCash', 'Year-1 cash-on-cash', 'pct', function(c){ var r = c.ret, e = c.debt ? pos(c.debt.equity) : null; if(!r || !e) return null; var y = (r.rows || []).slice(0, 12).reduce(function(t, x){ return t + (Number(x.noi) || 0) - (Number(x.reserve) || 0) - (Number(x.ds) || 0) - (Number(x.assetFee) || 0); }, 0); return fin(y / e); }, { note:'first twelve months of cash after debt service / equity' }),
  M('leveredIRR', 'Levered IRR', 'pct', function(c){ return c.ret ? fin(c.ret.irr) : null; }),
  M('unleveredIRR', 'Unlevered IRR', 'pct', function(c){ var r = c.ret; if(!r) return null; return fin(r.u && r.u.irr != null ? r.u.irr : (c.acf ? c.acf.irr : null)); }),
  M('moic', 'Equity multiple', 'x', function(c){ return c.ret ? fin(c.ret.moic) : null; }),
  M('grossSale', 'Gross sale price', 'money', function(c){ var r = c.ret, last = r && r.rows ? r.rows[r.rows.length - 1] : null; return fin(c.acf && !/develop/i.test(String(c.s.dealType || '')) ? c.acf.grossSale : last && last.grossSale); }),
  /* development */
  M('land', 'Land cost', 'money', function(c){ return c.dev ? pos(c.dev.land) : null; }),
  M('hardSoft', 'Hard and soft costs', 'money', function(c){ return c.dev ? pos(c.dev.hard + c.dev.soft) : null; }),
  M('devCost', 'Total development cost (before financing)', 'money', function(c){ return c.dev ? pos(c.dev.unlev) : null; }),
  M('capitalization', 'Total capitalization (incl. financing)', 'money', function(c){ return c.fund ? pos(c.fund.levered) : null; }),
  M('conLoan', 'Construction facility', 'money', function(c){ return c.fund ? pos(c.fund.commit) : null; }),
  M('devEquity', 'Equity requirement', 'money', function(c){ return c.fund ? pos(c.fund.equityTotal) : null; }),
  M('capInt', 'Capitalized interest', 'money', function(c){ return c.fund ? fin(c.fund.actualCapInt) : null; }),
  M('timeline', 'Months to stabilization', 'int', function(c){ return c.dev ? pos(c.dev.stab) : null; }),
  M('stabNOI', 'Stabilized NOI', 'money', function(c){ return c.calc ? fin(c.calc.noi) : null; }),
  M('yieldOnCost', 'Yield on cost', 'pct', function(c){ return c.calc && c.dev && c.dev.unlev > 0 ? fin(c.calc.noi / c.dev.unlev) : null; }),
  M('stabValue', 'Stabilized value', 'money', function(c){ return c.take ? pos(c.take.stabVal) : null; }),
  M('devSpread', 'Development spread (yield on cost less exit cap)', 'bps', function(c){ var e = pos(Number(c.s.exitCap)); return c.calc && c.dev && c.dev.unlev > 0 && e ? fin((c.calc.noi / c.dev.unlev - e) * 10000) : null; }),
  /* planned */
  P('noiNormalized', 'Normalized NOI', 'money'), P('noiStabilized', 'Stabilized NOI', 'money'), P('capRate', 'Selected cap rate', 'pct'), P('marketValue', 'Estimated market value', 'money'),
  P('valuePerUnit', 'Value per unit', 'money'), P('valuePerSF', 'Value per SF', 'money'),
  P('currentValue', 'Current property value', 'money'), P('existingPayoff', 'Existing loan payoff', 'money'), P('newLoan', 'Proposed loan', 'money'), P('newLTV', 'LTV', 'pct'), P('newDSCR', 'DSCR', 'x'), P('newDY', 'Debt yield', 'pct'),
  P('refiCosts', 'Refinance costs', 'money'), P('netProceeds', 'Net proceeds', 'money'), P('cashOut', 'Cash-out proceeds', 'money'), P('equityRetained', 'Remaining equity', 'money'),
  P('forwardNOI', 'Forward NOI', 'money'), P('netSaleNow', 'Net proceeds from selling now', 'money'), P('holdIRR', 'Hold-case IRR', 'pct'), P('saleTax', 'Estimated tax on sale', 'money'),
  P('afterTaxIRR', 'After-tax IRR', 'pct'), P('capitalRequired', 'Capital improvement requirements', 'money'),
  P('assetCount', 'Properties', 'int'), P('gav', 'Gross asset value', 'money'), P('portfolioDebt', 'Outstanding debt', 'money'), P('portfolioEquity', 'Portfolio equity', 'money'), P('portfolioNOI', 'NOI', 'money'),
  P('portfolioLTV', 'Portfolio LTV', 'pct'), P('portfolioIRR', 'Portfolio IRR (combined dated cash flow)', 'pct'), P('maturityExposure', 'Debt maturing within 24 months', 'money'),
  P('bizRevenue', 'Revenue', 'money'), P('bizEBITDA', 'EBITDA', 'money'), P('bizFCF', 'Free cash flow', 'money'), P('bizValue', 'Business value', 'money'), P('bizMultiple', 'EV / EBITDA', 'x')
]);
function sum(id, question, primary, metrics){ R.addSummary(id, { question:question, primary:primary, metrics:metrics }); }
sum('valuation', 'What is the property worth today on its income?', 'marketValue', ['gpi', 'egi', 'opex', 'noiInPlace', 'noiNormalized', 'noiStabilized', 'capRate', 'valuePerUnit', 'valuePerSF']);
sum('acquisition', 'Should we buy it, and at what price?', 'leveredIRR', ['price', 'totalCost', 'equity', 'noiInPlace', 'goingInCap', 'loan', 'ltv', 'dscr', 'cashOnCash', 'unleveredIRR', 'moic', 'grossSale']);
sum('development', 'Does the project pencil?', 'leveredIRR', ['land', 'hardSoft', 'devCost', 'capitalization', 'conLoan', 'devEquity', 'capInt', 'timeline', 'stabNOI', 'yieldOnCost', 'stabValue', 'devSpread', 'unleveredIRR', 'moic']);
sum('refinance', 'How much can we borrow, and what does it leave us?', 'netProceeds', ['currentValue', 'noiInPlace', 'existingPayoff', 'newLoan', 'newLTV', 'newDSCR', 'newDY', 'refiCosts', 'cashOut', 'equityRetained']);
sum('hold', 'Keep the property or sell it?', 'holdIRR', ['currentValue', 'noiInPlace', 'forwardNOI', 'capitalRequired', 'existingPayoff', 'netSaleNow', 'saleTax']);
sum('comprehensive', 'The full model of one investment', 'leveredIRR', ['totalCost', 'equity', 'noiInPlace', 'capitalRequired', 'loan', 'dscr', 'unleveredIRR', 'moic', 'cashOnCash', 'afterTaxIRR']);
sum('portfolio', 'How do our properties add up?', 'portfolioIRR', ['assetCount', 'gav', 'portfolioDebt', 'portfolioEquity', 'portfolioNOI', 'portfolioLTV', 'maturityExposure']);
sum('business', 'What is the operating business worth?', 'bizValue', ['bizRevenue', 'bizEBITDA', 'bizFCF', 'bizMultiple']);
/* the summary of a deal under its analysis: the primary output and the metrics, each with its value or null (missing) */
R.summarize = function(s){ s = s || (typeof bkLoad === 'function' ? bkLoad() : {}); var a = R.of(s), sp = R.summary(a.id), c = ctx(s);
  var row = function(id){ var m = R.metric(id); return { id:id, label:m.label, fmt:m.fmt, note:m.note || '', planned:!!m.planned, value:m.planned ? null : safe(function(){ return m.get(c); }, null) }; };
  return { analysis:a, question:sp.question, primary:row(sp.primary), metrics:sp.metrics.map(row) }; };
})();
