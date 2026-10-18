"""Independent refinance / recapitalisation (from the Capital Markets model's 24_REFI RECAP formulas), driven by model.py's own
monthly levered cash flow - not by anything the app produced. check(s, inputs) -> figures to compare with bkRefi()."""
import math
from model import model, xirr

def pv_annuity(rate, years, annual):                       # PV(rate/12, years*12, -annual/12)
    i = rate / 12; n = round(years * 12)
    return annual / 12 * (1 - (1 + i) ** -n) / i

def pmt_m(rate, years, loan):
    i = rate / 12; n = round(years * 12)
    return loan * i / (1 - (1 + i) ** -n)

def bal_after(loan, rate, years, k):
    i = rate / 12; p = pmt_m(rate, years, loan); g = (1 + i) ** k
    return loan * g - p * (g - 1) / i

def balance(m, k):                                          # existing loan: closed form from the loan, rate and amortisation
    i = m['monthlyRate']; n = m['amortMonths']; L = m['loan']; P = m['monthlyPmt']; g = (1 + i) ** k
    return L * g - P * (g - 1) / i

def metrics(vals, dts, eq):
    net = [vals[0] - eq] + list(vals[1:])                  # the engine's month-1 flow already includes the equity draw, so positives / negatives are taken after netting it
    pos = sum(v for v in net if v > 0); neg = -sum(v for v in net if v < 0)
    return dict(irr=xirr([-eq] + vals, dts), moic=pos / neg if neg else 0.0, profit=sum(vals) - eq)

def refi_at(m, noi_by_year, y, inp):
    noi = noi_by_year[y - 1]; bal = balance(m, y * 12); value = noi / inp['appraisalCap']
    caps = dict(LTV=value * inp['maxLTV'], DSCR=pv_annuity(inp['rate'], inp['amort'], noi / inp['minDSCR']), **{'Debt yield': noi / inp['minDebtYield']})
    loan = min(caps.values()); binding = [k for k, v in caps.items() if v == loan][0]
    costs = loan * inp['costsPct']; prepay = bal * inp['prepayPct']; net = loan - bal - costs - prepay
    pm = pmt_m(inp['rate'], inp['amort'], loan); H = m['holdMonths']; n_years = H // 12
    bal_exit = bal_after(loan, inp['rate'], inp['amort'], (n_years - y) * 12); pen = bal_exit * inp['exitPenaltyPct']
    vals = list(m['levCF'])                                  # model.py's lev already carries the original payoff and debt service
    vals[y * 12 - 1] += net
    for i in range(y * 12, H): vals[i] += m['monthlyPmt'] - pm
    vals[H - 1] += m['exitBalance'] - bal_exit - pen
    out = metrics(vals, m['levDates'], m['equityAtClose'])
    out.update(noi=noi, value=value, existingBalance=bal, newLoan=loan, binding=binding, costs=costs, prepay=prepay, netCashOut=net, postDSCR=noi / (pm * 12),
               postDY=noi / loan, postLTV=loan / value, newBalanceAtExit=bal_exit, exitPenalty=pen, cashBeforeExit=sum(vals[:H - 1]),
               payoffAtExit=bal_exit + pen)
    return out

def check(s, inp):
    m = model(s); n_years = m['holdMonths'] // 12
    base = metrics(list(m['levCF']), m['levDates'], m['equityAtClose']); base['cashBeforeExit'] = sum(m['levCF'][:m['holdMonths'] - 1]); base['payoffAtExit'] = m['exitBalance']
    sel = refi_at(m, m['noiYear'], inp['year'], inp) if 1 <= inp['year'] <= n_years - 1 else None
    timing = [refi_at(m, m['noiYear'], y, inp) for y in range(2, n_years)]
    verdict = None
    if sel:
        d_irr, d_profit, d_moic = sel['irr'] - base['irr'], sel['profit'] - base['profit'], sel['moic'] - base['moic']
        verdict = ('DO NOT REFINANCE' if sel['postDSCR'] < inp['minDSCR'] else 'REFINANCE' if d_irr > 0 and d_profit > 0 else 'TRADE-OFF' if d_irr > 0 else 'DO NOT REFINANCE (dilutive)')
    return dict(base=base, selected=sel, timing=timing, verdict=verdict, peakYear=max(timing, key=lambda x: x['netCashOut']) if timing else None)
