#!/usr/bin/env python3
"""Independent property-valuation model for audit/valuation_test.js, from the deal's raw inputs (no rent roll): in-place NOI (average-rent operating statement, before
reserves), normalized NOI (+ the adjustments), stabilized NOI (market rent per unit at the stabilized vacancy, management re-charged on the new income, same adjustments),
value = NOI / cap rate for each (in-place and stabilized may carry their own cap rates), the as-is stabilized value less the cost to stabilize, the comparable medians and a
cap-rate sensitivity in 25 bp steps.
    python3 audit/val_ref.py deal.json"""
import json, sys, statistics
S = json.load(open(sys.argv[1]))
g = lambda k, d=0.0: float(S[k]) if S.get(k) not in (None, '') else d
units, gsf = g('units'), g('gsf')
gpr = g('avgRent') * units * 12; other = g('otherIncomePerUnit') * units
def stmt(gpr, vac):
    bad = gpr * ((1 - vac) if S.get('_bdBasis') == 'afterVacancy' else 1) * g('badDebtPct')   # credit loss on the convention the engine reports (after vacancy, or gross)
    egi = gpr * (1 - vac) - bad - gpr * g('concessionPct') + other
    fixed = sum(g(k) for k in ['taxes', 'insurance', 'utilities', 'rm', 'contract', 'payroll', 'turnover', 'marketing', 'ga']) + gsf * g('miscPerGSF')
    return egi, fixed + egi * g('mgmtPct')
egi, opex = stmt(gpr, g('vacancy')); noi_in = egi - opex
adj = sum(float(a.get('amount') or 0) for a in S.get('valAdjustments') or [])
egi_s, opex_s = stmt(g('valMarketRent') * units * 12, g('valStabVacancy', g('vacancy'))); noi_st = egi_s - opex_s + adj
cap = g('valCapRate'); cap_in = g('valCapInPlace') or cap; cap_st = g('valCapStab') or cap
sc = {'inplace': (noi_in, cap_in), 'normalized': (noi_in + adj, cap), 'stabilized': (noi_st, cap_st)}
out = {k: dict(noi=n, cap=c, value=n / c, perUnit=n / c / units, perSF=n / c / gsf) for k, (n, c) in sc.items()}
out['stabilized']['asIs'] = out['stabilized']['value'] - g('valStabCost')
con = S.get('valConclusion') or 'normalized'; cn, cc = sc[con]
caps, pu, psf = [], [], []
for x in S.get('valComps') or []:
    p = float(x['price']); c = x.get('capRate') or (x['noi'] / p if x.get('noi') else None)
    if c: caps.append(float(c))
    if x.get('units'): pu.append(p / x['units'])
    if x.get('sf'): psf.append(p / x['sf'])
print(json.dumps(dict(egi=egi, opex=opex, scen=out, conclusion=con, value=cn / cc, medCap=statistics.median(caps), medUnit=statistics.median(pu), medSF=statistics.median(psf),
    sens=[cn / (cc + d) for d in (-0.0075, -0.005, -0.0025, 0, 0.0025, 0.005, 0.0075)])))
