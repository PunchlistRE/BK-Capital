#!/usr/bin/env python3
"""Independent model of the loan-sizing rule for audit/loan_sizing_test.js (bkSizeLoan, src/130a), written from the definition rather than from the app's code.

A loan is the lowest of what each test allows:
    ltv    value x maximum LTV
    dscr   (NOI / minimum DSCR) / annual debt service per $1 of loan; the debt service per $1 is given, or derived from the rate and the amortization
           as 12 x the level monthly payment on $1 (zero rate: the loan is repaid in equal parts, so the capacity is the annual amount x the years)
    dy     NOI / minimum debt yield
    extra  caps already in dollars
and the binding test is the first cap equal to the lowest (a tie goes to ltv, dscr, dy, then the extras).

    python3 audit/sizing_ref.py cases.json   ->   [{ "caps": [[id, loan], ...], "loan": x, "binding": id }, ...]
Cases are finite and valid (invalid inputs are checked by hand in the test, not modelled here)."""
import json, math, sys


def whole_months(years):
    return math.floor(years * 12 + 0.5)          # round half up, as the app does (Python's round() is banker's rounding)


def debt_constant(rate, years, round_months):
    """annual debt service per $1 of loan for a level-payment loan"""
    if rate == 0:
        return 1.0 / years                        # repaid in equal parts over the term
    i = rate / 12.0
    n = whole_months(years) if round_months else years * 12.0
    return 12.0 * i / (1.0 - (1.0 + i) ** -n)


def size(c):
    caps = []
    for t in c.get('tests', ['ltv', 'dscr', 'dy']):
        if t == 'ltv':
            caps.append(['ltv', c['value'] * c['maxLTV']])
        elif t == 'dscr':
            annual = c['noi'] / c['minDSCR']
            k = c['debtConstant'] if 'debtConstant' in c else debt_constant(c['rate'], c['amortYears'], c.get('roundMonths', False))
            caps.append(['dscr', annual / k])
        elif t == 'dy':
            caps.append(['dy', c['noi'] / c['minDY']])
    for e in c.get('extra', []):
        caps.append([e['id'], e['loan']])
    if not caps:
        return {'caps': [], 'loan': None, 'binding': None}
    low = min(x[1] for x in caps)
    binding = next(x[0] for x in caps if x[1] == low)
    return {'caps': caps, 'loan': low, 'binding': binding}


if __name__ == '__main__':
    print(json.dumps([size(c) for c in json.load(open(sys.argv[1]))]))
