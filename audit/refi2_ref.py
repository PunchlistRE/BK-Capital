#!/usr/bin/env python3
"""Independent refinancing model for audit/refinance_test.js, written from the deal's raw inputs: NOI (average-rent operating statement), value (entered, or
NOI / cap rate), payoff (balance + prepayment), the new loan as the lowest of LTV, DSCR (amortizing payment) and debt-yield capacity and the amount requested,
rounded down to $1,000, year-1 debt service (interest-only when there is an interest-only period), and net proceeds.
    python3 audit/refi2_ref.py deal.json"""
import json, sys, math
S = json.load(open(sys.argv[1]))
g = lambda k, d=0.0: float(S.get(k) or d) if S.get(k) not in (None, '') else d
units = g('units'); gpr = g('avgRent') * units * 12; vac = -gpr * g('vacancy'); bad = -gpr * g('badDebtPct'); other = g('otherIncomePerUnit') * units
egi = gpr + vac + bad + other
opex = sum(g(k) for k in ['taxes', 'insurance', 'utilities', 'rm', 'contract', 'payroll', 'turnover', 'marketing', 'ga']) + egi * g('mgmtPct') + g('gsf') * g('miscPerGSF')
noi = egi - opex
if S.get('lenderNoiBasis') == 'after': noi -= g('reserves')
value = g('currentValue') or (noi / g('valCapRate') if g('valCapRate') else None)
payoff = g('exLoanBalance') + g('exPrepay')
def mpay(r, n): return r / (1 - (1 + r) ** -n) if r else 1 / n
ex_am = g('exLoanAmort'); ex_ds = g('exLoanBalance') * (12 * mpay(g('exLoanRate') / 12, ex_am * 12) if ex_am > 0 else g('exLoanRate'))
def size(t):
    rate, am, io = t['rate'], t.get('amort') or 0, t.get('io') or 0
    f = 12 * mpay(rate / 12, am * 12) if am > 0 else rate
    caps = {}
    if t.get('maxLTV') and value: caps['Loan to value'] = value * t['maxLTV']
    if t.get('minDSCR'): caps['Debt service coverage'] = noi / t['minDSCR'] / f
    if t.get('minDY'): caps['Debt yield'] = noi / t['minDY']
    if t.get('amount'): caps['Amount requested'] = t['amount']
    binding = min(caps, key=caps.get); loan = math.floor(caps[binding] / 1000) * 1000
    ds1 = loan * rate if (io > 0 or am <= 0) else loan * f
    return dict(loan=loan, binding=binding, ds1=ds1, dscr=noi / ds1, dy=noi / loan, ltv=loan / value if value else None, net=loan - payoff - t['costs'])
base = dict(rate=g('newLoanRate'), amort=g('newLoanAmort'), io=g('newLoanIO'), maxLTV=g('lenderMaxLTV'), minDSCR=g('lenderMinDSCR'), minDY=g('lenderMinDY'), costs=g('newLoanCosts'), amount=g('newLoanAmount'))
KEYS = [('rate', 'newLoanRate'), ('amort', 'newLoanAmort'), ('io', 'newLoanIO'), ('maxLTV', 'lenderMaxLTV'), ('minDSCR', 'lenderMinDSCR'), ('minDY', 'lenderMinDY'), ('costs', 'newLoanCosts'), ('amount', 'newLoanAmount')]
alts = []
for a in S.get('refiScenarios') or []:
    t = dict(base); t.update({k: float(a[s]) for k, s in KEYS if a.get(s) not in (None, '')}); alts.append(size(t))
print(json.dumps(dict(noi=noi, value=value, payoff=payoff, exDS=ex_ds, main=size(base), alts=alts)))
