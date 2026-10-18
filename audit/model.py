"""Independent re-implementation of the BK Capital acquisition engine, written from the documented
conventions rather than from the app's code. Used by conventions_test.py to verify every setting.

Scope: flat average-rent acquisition deals with fixed-rate amortising debt (the two sample deals).
Conventions (deal fields; absent = legacy, exactly as the app resolves them):
  cvRentGrowthStart  'month1' (legacy) | 'year2'
  cvOpexVariablePct  0.4 (legacy) | any share 0..1
  cvLtvBasis         'value' (legacy, Year-1 NOI / exit cap) | 'price' | 'lesser'
  cvHurdleBasis      'deal' (legacy) | 'lp'
  cvBadDebtBasis     'legacy' (statement on gross rent, monthly after vacancy) | 'afterVacancy' | 'gross'
Development deals are out of scope: the app resolves them to the legacy conventions.
"""
import math, calendar
from datetime import date

LEGACY = dict(cvRentGrowthStart='month1', cvOpexVariablePct=0.4, cvLtvBasis='value', cvHurdleBasis='deal', cvBadDebtBasis='legacy')


def conv(s):
    return {k: (s.get(k) if s.get(k) not in (None, '') else v) for k, v in LEGACY.items()}


def xirr(vals, dts):
    t0 = dts[0]
    f = lambda r: sum(v / (1 + r) ** ((t - t0).days / 365) for v, t in zip(vals, dts))
    lo, hi = -0.99, 10.0
    if f(lo) * f(hi) > 0:
        return float('nan')
    for _ in range(200):
        mid = (lo + hi) / 2
        if f(lo) * f(mid) <= 0: hi = mid
        else: lo = mid
    return (lo + hi) / 2


def model(s, acq_fee=0.01):
    N = lambda k: float(s.get(k) or 0)
    c = conv(s)
    gpr = N('avgRent') * N('units') * 12
    other = N('otherIncomePerUnit') * N('units')
    occ = 1 - min(1, max(0, N('vacancy'))) if N('units') > 0 else 0
    # Year-1 underwriting statement (sizes the loan)
    bad_base1 = gpr * (1 - N('vacancy')) if c['cvBadDebtBasis'] == 'afterVacancy' else gpr
    egi1 = gpr * (1 - N('vacancy') - N('lossToLeasePct') - N('concessionPct')) - bad_base1 * N('badDebtPct') + other
    fixed = sum(N(k) for k in ['taxes', 'insurance', 'utilities', 'rm', 'contract', 'payroll', 'turnover', 'marketing', 'ga']) + N('gsf') * N('miscPerGSF')
    noi1 = egi1 - fixed - egi1 * N('mgmtPct')
    price = N('purchasePrice')
    basis = price * (1 + N('closingCostsPct') + acq_fee)
    r = N('acqRate') / 12; n = int(N('acqAmort') * 12)
    pmt = lambda pv: pv * r / (1 - (1 + r) ** -n) if r else pv / n
    value = noi1 / N('exitCap') if N('exitCap') > 0 else 0
    ltv_value = {'price': price, 'lesser': min(price, value) if value > 0 else price, 'value': value}[c['cvLtvBasis']]
    byLTV = N('acqLTV') * ltv_value
    byLTC = N('acqLTC') * basis if N('acqLTC') > 0 else float('inf')
    byDSCR = (noi1 / N('acqDSCR')) / (pmt(1) * 12) if N('acqDSCR') > 0 else float('inf')
    loan = math.floor(max(0, min(byLTV, byLTC, byDSCR)) / 1000) * 1000
    P = pmt(loan); equity = basis + loan * N('acqOrigFee') - loan
    hy = max(1, min(15, round(N('holdYears') or 10))); H = hy * 12
    ctrl_y1 = sum(N(k) for k in ['rm', 'payroll', 'turnover', 'utilities', 'contract', 'marketing', 'ga']) + N('gsf') * N('miscPerGSF')
    v = float(c['cvOpexVariablePct'])
    expo = (lambda m: math.ceil(m / 12) - 1) if c['cvRentGrowthStart'] == 'year2' else (lambda m: m / 12)

    def month(m):
        g = lambda k: (1 + N(k)) ** expo(m)
        gross = gpr / 12 * g('rentGrowth'); res = gross * occ
        e = res - (gross if c['cvBadDebtBasis'] == 'gross' else res) * N('badDebtPct') - gross * N('lossToLeasePct') - gross * N('concessionPct') + other / 12 * g('otherGrowth')
        ctrl = ctrl_y1 / 12 * g('opexGrowth') * ((1 - v) + v * occ)
        nb = e - ctrl - N('insurance') / 12 * g('opexGrowth') - N('taxes') / 12 * (1 + N('taxGrowth')) ** (math.ceil(m / 12) - 1) - e * N('mgmtPct')
        return e, nb - N('reserves') / 12 * g('opexGrowth')

    ms = [month(m) for m in range(1, H + 1)]
    gross_sale = sum(month(m)[1] for m in range(H + 1, H + 13)) / N('exitCap')
    net = gross_sale * (1 - N('saleCostPct'))
    bal = loan
    for _ in range(H): bal -= (P - bal * r)
    close = date(2027, 1, 1)

    def me(m):
        y = close.year + (m - 1) // 12; mo = (m - 1) % 12 + 1
        return date(y, mo, calendar.monthrange(y, mo)[1])

    dts = [close] + [me(m) for m in range(1, H + 1)]
    u = [-basis] + [x[1] for x in ms]; u[-1] += net
    lev = [x[1] - P - x[0] * N('assetMgmtPct') for x in ms]
    lev[-1] += net - bal - gross_sale * N('dispositionFeePct')

    # ---- equity waterfall: monthly IRR-hurdle accounts
    gs = N('gpShare'); ls = 1 - gs
    mr = lambda a: (1 + a) ** (1 / 12) - 1
    rates = [mr(N('pref')), mr(N('hurdle2')), mr(N('hurdle3'))]
    split_lp = [ls, N('t2LP'), N('t3LP'), N('t4LP')]
    tgt = N('gpCatchupTarget')
    acct = [0.0, 0.0, 0.0]; cumCon = cumDist = cumProm = 0.0
    lp_cf, gp_cf, rows = [], [], []
    for i, cf in enumerate(lev):
        con = (equity if i == 0 else 0.0) + max(0.0, -cf)      # a monthly shortfall is an equity call
        dist = max(0.0, cf)
        if c['cvHurdleBasis'] == 'lp':
            lc = con * ls
            acct = [(a + lc) * (1 + rt) for a, rt in zip(acct, rates)]
            t1 = min(dist, acct[0] / ls) if ls > 0 else dist
            got = t1 * ls
            cumCon += con; pre = max(0.0, cumDist + t1 - cumCon)
            cu = min(max(0.0, dist - t1), max(0.0, (tgt * pre - cumProm) / (1 - tgt))) if N('gpCatchup') else 0.0
            rem = dist - t1 - cu; tiers = [t1, cu]
            for k in (1, 2):
                need = max(0.0, acct[k] - got)
                tk = min(rem, need / split_lp[k]) if split_lp[k] > 0 else 0.0
                got += tk * split_lp[k]; rem -= tk; tiers.append(tk)
            t4 = max(0.0, rem); got += t4 * split_lp[3]; tiers.append(t4)
            acct = [max(0.0, a - got) for a in acct]
            t1, cu, t2, t3, t4 = tiers
            lpd = got
        else:
            req = [(a + con) * (1 + rt) for a, rt in zip(acct, rates)]
            t1 = min(dist, req[0]); acct[0] = req[0] - t1
            cumCon += con; pre = max(0.0, cumDist + t1 - cumCon)
            cu = min(max(0.0, dist - t1), max(0.0, (tgt * pre - cumProm) / (1 - tgt))) if N('gpCatchup') else 0.0
            t2 = min(max(0.0, dist - t1 - cu), max(0.0, req[1] - t1 - cu)); acct[1] = max(0.0, req[1] - t1 - cu - t2)
            t3 = min(max(0.0, dist - t1 - cu - t2), max(0.0, req[2] - t1 - cu - t2)); acct[2] = max(0.0, req[2] - t1 - cu - t2 - t3)
            t4 = max(0.0, dist - t1 - cu - t2 - t3)
            lpd = t1 * ls + t2 * N('t2LP') + t3 * N('t3LP') + t4 * N('t4LP')
        gpd = t1 * gs + cu + t2 * (1 - N('t2LP')) + t3 * (1 - N('t3LP')) + t4 * (1 - N('t4LP'))
        cumProm += max(0.0, gpd - gs * (t1 + cu + t2 + t3 + t4)); cumDist += t1 + cu + t2 + t3 + t4
        extra = con - (equity if i == 0 else 0.0)
        lp_cf.append(lpd - extra * ls); gp_cf.append(gpd - extra * gs)
        rows.append(dict(dist=dist, lp=lpd, gp=gpd, t2=t2, t3=t3, t4=t4))
    levv = [-equity] + lev
    return dict(
        loan=loan, equity=equity, ltvValue=ltv_value, y1NOI=sum(x[1] for x in ms[:12]), grossSale=gross_sale,
        unlevIRR=xirr(u, dts), unlevMOIC=sum(x for x in u if x > 0) / basis,
        levIRR=xirr(levv, dts), levMOIC=sum(x for x in levv if x > 0) / -sum(x for x in levv if x < 0),   # shortfall calls count as contributions
        lpIRR=xirr([-equity * ls] + lp_cf, dts), gpIRR=xirr([-equity * gs] + gp_cf, dts),
        lpDist=sum(r_['lp'] for r_ in rows), gpDist=sum(r_['gp'] for r_ in rows), totalDist=sum(r_['dist'] for r_ in rows),
        promoteTiersPaid=sum(r_['t2'] + r_['t3'] + r_['t4'] for r_ in rows))
