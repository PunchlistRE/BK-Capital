/* ANALYSIS REGISTRY - VALIDATION RULES. Which checks apply to each analysis. A rule not listed for an analysis is N/A there (never a failure).
   'source' names where the check runs today: bkIntegrity check ids (src/178), the waterfall checks (src/169), the readiness machine (src/081),
   the conflict rules (src/129) and the credit gate (src/127). planned: a check that belongs to an analysis not built yet. */
(function(){
'use strict';
if(!window.BKReg) return;
var R = window.BKReg;
function X(id, label, source, o){ return Object.assign({ id:id, label:label, source:source }, o || {}); }
R.addRules([
  X('readiness', 'Required inputs are present (nothing missing is treated as zero)', 'readiness'), X('conflicts', 'Inputs do not contradict each other', 'conflicts'),
  X('credit', 'Credit gate: failed checks hold the decision', 'credit'),
  X('budget', 'Hard and soft cost totals equal their lines', 'integrity:budget'), X('unlev', 'Cost before financing adds up', 'integrity:unlev'), X('su', 'Sources equal uses', 'integrity:su'),
  X('draws', 'Every month\'s cost is funded', 'integrity:draws'), X('capint', 'Capitalised interest rolls forward', 'integrity:capint'), X('facility', 'The balance never exceeds the facility', 'integrity:facility'),
  X('fixed', 'Principal stays within a fixed facility', 'integrity:fixed'), X('payoff', 'Debt repaid at sale equals the balance', 'integrity:payoff'), X('sale', 'Net sale equals gross less costs', 'integrity:sale'),
  X('eqret', 'Equity in returns equals the funding ledger', 'integrity:eqret'), X('contrib', 'LP + GP contributions tie', 'integrity:contrib'), X('unlev_irr', 'Unlevered returns are calculated', 'integrity:unlev_irr'),
  X('irr', 'Levered IRR equals an independent XIRR', 'integrity:irr'), X('moic', 'Multiple = distributions / contributions', 'integrity:moic'), X('waterfall', 'Hurdles replay, tiers in order, every dollar once', 'waterfall'),
  X('noiTies', 'NOI = income less expenses, by line', 'planned', { planned:true }), X('valueTies', 'Value = NOI / cap rate for each scenario', 'planned', { planned:true }), X('noDebt', 'No financing figure reaches a valuation', 'planned', { planned:true }),
  X('payoffTies', 'Payoff = balance + accrued interest + prepayment', 'planned', { planned:true }), X('sizingTies', 'Loan = the lowest of the lender tests', 'planned', { planned:true }),
  X('basisTies', 'Basis, land, depreciation and accumulated depreciation reconcile', 'planned', { planned:true }), X('capitalTies', 'Capital budget, actuals and funding reconcile', 'planned', { planned:true }),
  X('portfolioTies', 'Consolidated flows equal the sum of the holdings; nothing counted twice', 'planned', { planned:true }), X('bizTies', 'EBITDA, free cash flow and value reconcile', 'planned', { planned:true })
]);
var CORE = ['readiness', 'conflicts', 'sale', 'payoff', 'eqret', 'contrib', 'unlev_irr', 'irr', 'moic', 'waterfall', 'credit'];
R.addChecks('acquisition', CORE);
R.addChecks('development', ['budget', 'unlev', 'su', 'draws', 'capint', 'facility', 'fixed'].concat(CORE));
R.addChecks('valuation', ['readiness', 'conflicts', 'noiTies', 'valueTies', 'noDebt']);
R.addChecks('refinance', ['readiness', 'conflicts', 'noiTies', 'payoffTies', 'sizingTies']);
R.addChecks('hold', ['readiness', 'conflicts', 'sale', 'payoff', 'irr', 'moic', 'basisTies']);
R.addChecks('comprehensive', CORE.concat(['capitalTies', 'basisTies']));
R.addChecks('portfolio', ['portfolioTies']);
R.addChecks('business', ['readiness', 'bizTies']);
/* applies(analysisId, integrityCheckId): false means N/A for this analysis */
R.applies = function(aid, checkId){ var ids = R.checks(aid); return ids.some(function(id){ var r = R.rule(id); return r && (r.source === 'integrity:' + checkId || id === checkId); }); };
})();
