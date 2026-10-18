"""Independent implementation of the credit layer (debt capacity, risk cushions, IC gate), written from the Capital Markets
model's formulas (20_DEBT sizing bridge, 11_ACQUISITION break-even block, 92_SYSTEM policy test table and verdict), not
from the app's code. It drives model.py (itself independent of the app) for every NOI / IRR it needs.

    check(s, policy, ic) -> dict of figures to compare with the app's bkDealGate()
"""
import math
from model import model

DEFAULTS = dict(targetIRR=0.12, targetEM=2.25, targetLpIRR=0.12, targetLpEM=2.0, minDSCR=1.25, minDebtYield=0.085, maxLTV=0.65, maxLTC=0.70,
                stressBps=150, minGoingInCap=0.05, minDevSpreadBps=150, maxBreakEvenOcc=0.75, minNOITolerance=0.15, minRentCushion=0.10,
                maxHighRisks=2, maxDebtOverage=0, advanceScore=0.85, conditionalScore=0.65, exitCapStressBps=75)
# gate: (id, direction, severity, weight) - the CMM policy test table
GATES = [('grossIRR', '>=', 'HARD', 0.00), ('lpIRR', '>=', 'HARD', 0.18), ('lpEM', '>=', 'SOFT', 0.08), ('dscr', '>=', 'HARD', 0.12), ('debtYield', '>=', 'HARD', 0.08),
         ('ltv', '<=', 'HARD', 0.04), ('capacity', '<=', 'HARD', 0.16), ('goingIn', '>=', 'SOFT', 0.10), ('beOcc', '<=', 'SOFT', 0.08), ('exitCush', '>=', 'SOFT', 0.04),
         ('noiTol', '>=', 'SOFT', 0.08), ('rentCush', '>=', 'SOFT', 0.04), ('risks', '<=', 'SOFT', 0.00)]

def pv(rate, years, annual_payment):                       # Excel PV(rate/12, years*12, -annual/12)
    i = rate / 12; n = round(years * 12)
    return annual_payment / 12 * (1 - (1 + i) ** -n) / i

def annual_ds(rate, years, loan):                          # -PMT(rate/12, years*12, loan) * 12
    i = rate / 12; n = round(years * 12)
    return loan * i / (1 - (1 + i) ** -n) * 12 if loan > 0 else 0.0

def bisect(f, lo, hi, target=0.0):
    flo = f(lo) - target
    for _ in range(100):
        mid = (lo + hi) / 2; fm = f(mid) - target
        if flo * fm <= 0: hi = mid
        else: lo, flo = mid, fm
    return (lo + hi) / 2

def check(s, policy=None, ic=None, gate_cfg=None):
    p = dict(DEFAULTS); p.update({k: float(v) for k, v in (policy or {}).items() if k in DEFAULTS})
    m = model(s); N = lambda k: float(s.get(k) or 0)
    noi1, noi3 = m['noiYear'][0], m['noiYear'][min(2, len(m['noiYear']) - 1)]
    coupon, years, loan, ds = m['coupon'], m['amortYears'], m['loan'], m['annualDS']
    stressed = coupon + p['stressBps'] / 1e4
    value, cost = m['ltvValue'], m['basis']
    caps = {
        'Loan-to-value': value * p['maxLTV'], 'Loan-to-cost': cost * p['maxLTC'],
        'DSCR, actual rate, amortizing': pv(coupon, years, noi1 / p['minDSCR']), 'DSCR, stressed rate, amortizing': pv(stressed, years, noi1 / p['minDSCR']),
        'DSCR, interest-only, actual rate': noi1 / p['minDSCR'] / coupon, 'Debt yield, underwriting NOI': noi1 / p['minDebtYield'], 'Debt yield, stabilised NOI': noi3 / p['minDebtYield']}
    capacity = min(caps.values()); binding = [k for k, v in caps.items() if v == capacity][0]
    out = dict(caps=caps, capacity=capacity, binding=binding, requested=loan, overage=loan - capacity, headroom=sorted(caps.values())[1] - capacity,
               dscr=noi1 / ds, debtYield=noi1 / loan, ltv=loan / value, ltc=loan / cost, stressedDscr=noi1 / annual_ds(stressed, years, loan),
               maxCoupon=bisect(lambda r: noi1 / annual_ds(r, years, loan), 0.0001, 0.40, p['minDSCR']))
    # --- cushions (each is a search against the independent model)
    def mod(**kw): d = dict(s); d.update(kw); return d
    base_cap = N('exitCap'); irr_at = lambda c: model(mod(exitCap=c))['levIRR']
    lo, hi, steps = max(0.01, base_cap - 0.03), base_cap + 0.06, 36
    pts = [(lo + (hi - lo) * i / steps, irr_at(lo + (hi - lo) * i / steps)) for i in range(steps + 1)]
    pts = [q for q in pts if q[1] == q[1]]
    be = None
    for a, b in zip(pts, pts[1:]):
        if (a[1] - p['targetIRR']) * (b[1] - p['targetIRR']) <= 0:
            be = bisect(irr_at, a[0], b[0], p['targetIRR']); break
    if be is None and pts:                      # target never crossed in the window: the cushion is reported as the window edge (a bound), so the gate still fails / passes
        if all(q[1] < p['targetIRR'] for q in pts): be = pts[0][0]
        elif all(q[1] > p['targetIRR'] for q in pts): be = pts[-1][0]
    out['exitCapCushion'] = (be - base_cap) * 1e4 if be is not None else None
    out['irrBase'] = m['levIRR']; out['irrDown'] = irr_at(base_cap + p['exitCapStressBps'] / 1e4); out['irrUp'] = irr_at(max(0.01, base_cap - p['exitCapStressBps'] / 1e4))
    vac_be = bisect(lambda v: model(mod(vacancy=v))['y1NOI'], 0.0, 0.95, ds)       # NOI = debt service, loan held at the underwritten size
    out['beOcc'] = 1 - vac_be
    out['noiTol1'] = (noi1 - p['minDSCR'] * ds) / noi1; out['noiTol3'] = (noi3 - p['minDSCR'] * ds) / noi3
    r0 = N('avgRent'); be_rent = bisect(lambda r: model(mod(avgRent=r))['y1NOI'], r0 * 0.2, r0 * 1.5, p['minDSCR'] * ds)
    out['beRent'] = be_rent; out['rentCush'] = r0 / be_rent - 1
    # --- the gate
    risks = [(r.get('prob') or 0) * (r.get('impact') or 0) for r in (ic or {}).get('risks', []) if (r.get('risk') or '').strip()]
    high = sum(1 for x in risks if x >= 12)
    ov = (ic or {}).get('override') or {}; ov_ok = ov.get('on') == 'YES' and (ov.get('reason') or '').strip() != '' and (ov.get('approvedBy') or '').strip() != ''
    lpem = m['lpDist'] / m['lpContrib'] if m['lpContrib'] > 0 else None
    cap_limit = capacity + p['maxDebtOverage'] + (9e99 if ov_ok else 0)
    vals = dict(grossIRR=(m['levIRR'], p['targetIRR']), lpIRR=(m['lpIRR'], p['targetLpIRR']), lpEM=(lpem, p['targetLpEM']), dscr=(out['dscr'], p['minDSCR']),
                debtYield=(out['debtYield'], p['minDebtYield']), ltv=(out['ltv'], p['maxLTV']), capacity=(loan, cap_limit),
                goingIn=(noi1 / N('purchasePrice'), p['minGoingInCap']), beOcc=(out['beOcc'], p['maxBreakEvenOcc']), exitCush=(out['exitCapCushion'], 0.0),
                noiTol=(out['noiTol3'], p['minNOITolerance']), rentCush=(out['rentCush'], p['minRentCushion']), risks=(high, p['maxHighRisks']))
    rows, score, hard, soft, wlive = {}, 0.0, 0, 0, 0.0
    cfg = gate_cfg or {}
    for gid, d, sev, w in GATES:
        sev = (cfg.get(gid) or {}).get('severity', sev); w = float((cfg.get(gid) or {}).get('weight', w))
        v, t = vals[gid]
        if v is None: rows[gid] = 'N/A'; continue
        ok = v >= t - 1e-12 if d == '>=' else v <= t + 1e-12
        rows[gid] = 'PASS' if ok else 'FAIL'; wlive += w; score += w if ok else 0
        if not ok: hard += sev == 'HARD'; soft += sev == 'SOFT'
    score = score / wlive if wlive else 0.0
    overage = out['overage']
    if not ov_ok and overage > p['maxDebtOverage']: verdict = 'DECLINE'
    elif hard == 0 and score >= p['advanceScore']: verdict = 'APPROVE'
    elif score >= p['conditionalScore'] or (hard == 0 and soft <= 2): verdict = 'CONDITIONAL'
    else: verdict = 'DECLINE'
    out.update(gate=rows, score=score, hard=hard, soft=soft, verdict=verdict, gateValues={k: v[0] for k, v in vals.items()})
    return out
