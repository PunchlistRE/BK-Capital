#!/usr/bin/env python3
"""A second, independent implementation of BK Capital's documented development conventions, written from the deal's raw inputs only (never from the engine's outputs).
   It rebuilds: the cost ladder, the monthly cost curves, the facility sizing, the funding loop (equity first, interest capitalized to the commitment), the operating cash flow,
   the sale, the dated levered and unlevered IRR, and the LP/GP hurdle waterfall. audit/harbor_stageB_test.js compares every figure with the engine.
       python3 audit/harbor/reference2.py inputs.json > out.json"""
import json, sys, math, calendar, datetime as dt
S = json.load(open(sys.argv[1])); SW = json.loads(sys.argv[2]) if len(sys.argv) > 2 else {}   # SW: optional switches that adopt the brief's own conventions one at a time (the reconciliation walk)
g = lambda k, d=0.0: float(S.get(k) or d)
def cdf(x):
    e = lambda z: (lambda sg, a: (lambda t: sg * (1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - .284496736) * t + .254829592) * t * math.exp(-a * a)))(1 / (1 + .3275911 * a)))(-1 if z < 0 else 1, abs(z))
    return .5 * (1 + e(x / math.sqrt(2)))
def curve(m, start, ln, method, steep):
    start, ln = round(start), round(ln)
    if ln <= 0 or m < start or m > start + ln - 1: return 0.0
    if str(method).lower().startswith('s-'):
        sig = ln / max(.0001, steep); k = m - start + 1; den = 1 - 2 * cdf(0 - ln / 2 / sig)
        return max(0, (cdf((k - ln / 2) / sig) - cdf((k - 1 - ln / 2) / sig)) / den) if den else 1 / ln
    return 1 / ln
units, gsf, price = g('units'), g('gsf'), g('purchasePrice')
# ---- cost ladder
trades = sum(g(k) * gsf for k in ['hc_demo', 'hc_sitework', 'hc_excavation', 'hc_parking', 'hc_podium', 'hc_envelope', 'hc_roofing', 'hc_mep', 'hc_elevators', 'hc_partitions', 'hc_unitint', 'hc_amenity', 'hc_commshell', 'hc_landscape']) * (1 + g('scnHardPct'))
gc = trades * g('hardGCPct'); fee = (trades + gc) * g('hardContractorFeePct'); bonds = (trades + gc + fee) * g('hardRiskBondsPct'); hcont = (trades + gc + fee + bonds) * g('hardContPct'); hard = trades + gc + fee + bonds + hcont
scn = 1 + g('scnSoftPct')
soft_sub = hard * g('sc_ae') + gsf * scn * sum(g(k) for k in ['sc_civil', 'sc_environmental', 'sc_entitlement', 'sc_permits', 'sc_legal', 'sc_retaxconst', 'sc_ocip', 'sc_marketing', 'sc_testing', 'sc_sustainability', 'sc_technology']) + (g('commercialArea') or gsf) * g('sc_ti') * scn + units * g('sc_ffe') * scn + price * g('sc_title') + hard * g('cmFeePct')
devfee = g('devFeePct') * (hard + soft_sub); soft = soft_sub + devfee + (soft_sub + devfee) * g('softContPct')
# contingency register: change orders and expected further use draw the hard contingency down; use beyond it is an overrun added to hard cost, and unused contingency comes out of cost only when the deal says it is saved
CT = S.get('contingency') or {}
if CT:
    used_ = sum(float(r_.get('amount') or 0) for r_ in (CT.get('changeOrders') or [])); fc_ = used_ + max(0.0, float(CT.get('forecastMore') or 0)); rem_ = hcont - fc_
    adj_ = max(0.0, -rem_) - (max(0.0, rem_) if CT.get('release') == 'saved' else 0.0); hard += adj_
land, close, acq, pre = price, price * g('closingPct'), price * g('acqFeePct'), g('predevCarry')
unlev = land + close + acq + pre + hard + soft
preMo, conMo, luMo, hold = int(g('predevMonths')), int(g('constructionMonths')), int(g('leaseupMonths')), round(g('holdYears') * 12)
co = preMo + conMo; stab = max(co + luMo, 1)
# ---- operations (annual run-rate)
gpr = units * g('avgRent') * 12; vac = -gpr * g('vacancy'); other = units * g('otherIncomePerUnit'); egi = gpr + vac + other
fixed = sum(g(k) for k in ['taxes', 'insurance', 'utilities', 'rm', 'payroll', 'contract', 'turnover', 'marketing', 'ga']); mgmt = egi * g('mgmtPct'); noi_pre = egi - fixed - mgmt; res = g('reserves'); noi_after = noi_pre - res
# ---- facility sizing
rate = g('conRate'); feeFac = g('conOrigFee') + g('conCapCost') + g('guarantyFeePct'); payoffMo = stab if g('refiAtStab') else hold
if SW.get('cap_to_exit'): payoffMo = hold + 1
accr = max(3, round((min(payoffMo, stab) - (preMo + 1) + 1) * .7)); intFac = g('conUtil') * rate * accr / 12; U0 = unlev + g('lenderLegal'); ltc = g('conLTC')
commit = math.floor((ltc * U0 / (1 - ltc * (feeFac + intFac))) / 1000) * 1000 if ltc > 0 and ltc * (feeFac + intFac) < 1 else 0
upfront = commit * feeFac + g('lenderLegal'); eqTarget = max(0, unlev + upfront + commit * intFac - commit) if commit > 0 else 9.9e14
CEIL = None
if SW.get('fixed_facility'): commit, CEIL, eqTarget, upfront = 27_300_000.0, 34_000_000.0, 14_700_000.0, 0.0
RES = {1: 1_250_000.0, co: 750_000.0} if SW.get('reserves') else {}
# optional deal-level terms (blank = absent): a fixed facility, a ceiling on the balance, equity first, an unused-commitment fee, initial reserves, a catch-up rate and an LP-only preferred return
FIXED, EQFIRST, UNUSED = g('conFixedAmt'), g('conEquityFirst'), g('conUnusedFeePct')
if FIXED > 0: commit = FIXED
if g('conCeiling') > 0 and not SW.get('fixed_facility'): CEIL = max(commit, g('conCeiling'))
if FIXED > 0:
    upfront = commit * feeFac + g('lenderLegal'); eqTarget = max(0, unlev + upfront + commit * intFac - commit)
if EQFIRST > 0: eqTarget = EQFIRST
RL = []
for r_ in (S.get('initReserves') or []):
    a_ = float(r_.get('amount') or 0)
    if a_ > 0:
        at_ = r_.get('at'); m_ = co if at_ == 'co' else stab if at_ == 'stab' else 1 if at_ in ('close', 'predev', None, '') else int(at_)
        RL.append(dict(mo=min(max(1, m_), hold), amt=a_, use=r_.get('use') if r_.get('use') in ('operating', 'interest') else 'held'))
resFunded = sum(r_['amt'] for r_ in RL); opBal = intBal = 0.0; prin = 0.0; unusedTot = 0.0
# ---- funding loop
bal = cumEq = capTot = 0.0; M = []
for mo in range(1, hold + 1):
    ld = (land + close + acq + pre) if mo == 1 else 0
    h = hard * curve(mo, preMo + 1, max(1, conMo), S.get('hardCurveMethod', 'S-Curve'), S.get('hardCurveSteepness', 7))
    pre_s = curve(mo, 1, preMo, S.get('softPreMethod', 'Straight-Line'), 1) if preMo > 0 else 0
    con_s = curve(mo, preMo + 1, max(1, conMo), S.get('softConMethod', 'S-Curve'), S.get('softConSteepness', 5)); lu_s = curve(mo, co + 1, luMo, S.get('softLeaseMethod', 'Straight-Line'), 1) if luMo > 0 else 0
    sf = soft * (.28 * pre_s + (.62 + (.28 if preMo == 0 else 0)) * con_s + .10 * lu_s)
    fe = upfront if mo == preMo + 1 else 0
    for r_ in RL:
        if r_['mo'] == mo:
            if r_['use'] == 'operating': opBal += r_['amt']
            elif r_['use'] == 'interest': intBal += r_['amt']
    un = max(0, commit - prin) * UNUSED / 12 if (UNUSED > 0 and commit > 0 and mo >= preMo + 1 and mo <= stab and mo < payoffMo) else 0; unusedTot += un
    need = ld + h + sf + fe + un + RES.get(mo, 0) + sum(r_['amt'] for r_ in RL if r_['mo'] == mo)
    eq = min(need, max(0, eqTarget - cumEq)); cumEq += eq
    interest = bal * rate / 12 if (commit > 0 and mo <= (hold if SW.get('cap_to_exit') else stab) and mo < payoffMo) else 0; cap = min(interest, max(0, (CEIL or commit) - bal)); exc = max(0, interest - cap)
    room = (CEIL - bal - cap) if CEIL else (commit - bal - cap)
    if not SW.get('fixed_facility'): room = min(room, commit - prin)
    draw = min(max(0, need - eq), max(0, room)) if (commit > 0 and mo < payoffMo) else 0; over = max(0, need - eq - draw)
    extra = 0.0
    if SW.get('fixed_facility'):
        extra = (273_000.0 if mo == 1 else 0) + (0.005 / 12 * max(0, commit - (bal - capTot)) if mo <= co else 0)
    resInt = min(exc, intBal); intBal -= resInt
    bal += cap + draw; prin += draw; capTot += cap
    M.append(dict(resInt=resInt, extra=extra, mo=mo, land=ld, hard=h, soft=sf, fees=fe, need=need, eq=eq, draw=draw, cap=cap, exc=exc, over=over, end=bal))
equity_total = cumEq + sum(z['over'] + z['exc'] - z['resInt'] for z in M)
# ---- cash flow rows
start = dt.date(2027, 1, 1)
def month_end(m):
    y, mm = divmod(start.month - 1 + m - 1, 12); y += start.year; return dt.date(y, mm + 1, calendar.monthrange(y, mm + 1)[1])
base_g = g('noiGrowth') or g('rentGrowth'); opexg = g('opexGrowth')
noi_year = lambda y: (noi_after + res) * (1 + base_g) ** (y - 1) - res * (1 + opexg) ** (y - 1)
pre_l = g('preleasedPct'); ramp = {}
WB = {27: .2, 28: .35}
for _m in range(29, 43): WB[_m] = .35 + (.95 - .35) * (_m - 28) / 14
for j in range(luMo):
    occ = min(1, pre_l + (1 - pre_l) * j / luMo)
    if SW.get('wb_ramp'): occ = WB.get(co + j, 0 if co + j < 27 else 0.95)
    e = egi * occ / 12; mg = e * g('mgmtPct'); n = e - fixed / 12 - mg; ramp[co + j] = (e, n - res / 12)
def curve_noi(k): return noi_year(max(1, math.ceil((k - stab + 1) / 12))) / 12 if k >= stab else ramp.get(k, (0, 0))[1]
opBal = sum(r_['amt'] for r_ in RL if r_['use'] == 'operating'); held = commit > 0 and not g('refiAtStab'); conBal = M[stab - 1]['end'] if held else 0; exitCap = g('exitCap'); saleCost = g('saleCostPct')
rows = []; OPRES = [750_000.0]; opUsed = 0.0
for mo in range(1, hold + 1):
    z = M[mo - 1]; op = mo >= stab; noi = curve_noi(mo); e_m = egi / 12 if op else ramp.get(mo, (0, 0))[0]; afee = e_m * g('assetMgmtPct')
    ds = conBal * rate / 12 if (held and mo > stab and not SW.get('cap_to_exit')) else 0; eqd = z['eq'] + z['over'] + z['exc'] - z['resInt'] + z['extra']; sale = dfee = pay = gross = 0
    if mo == hold:
        gross = ((noi_after + res) if SW.get('exit_stab') else sum(curve_noi(k) for k in range(hold + 1, hold + 13))) / exitCap; sale = gross * (1 - saleCost); dfee = gross * g('dispositionFeePct'); pay = (z['end'] if SW.get('cap_to_exit') else conBal) if held or SW.get('cap_to_exit') else 0
    rel = 0.0
    if RL:
        oth = noi - afee - ds
        if oth < 0:
            use = min(opBal, -oth); opBal -= use; opUsed += use; rel += use
        if mo == hold: rel += resFunded - opUsed - sum(z_['resInt'] for z_ in M)
    if SW.get('reserves'):
        oth = noi - afee - ds
        if oth < 0:
            use = min(OPRES[0], -oth); OPRES[0] -= use; rel += use    # the operating reserve pays the lease-up shortfall instead of the partners
        if mo == hold: rel += 2_000_000.0 - (750_000.0 - OPRES[0])   # the unused reserves are released at sale
    cf = -eqd + noi - afee - ds + sale - dfee - pay + rel; other_cf = cf + eqd
    ucost = z['land'] + z['hard'] + z['soft']
    rows.append(dict(m=mo, dt=month_end(mo), eqd=eqd, noi=noi, cf=cf, wfc=eqd + max(0, -other_cf), wfd=max(0, other_cf), u=-ucost + noi - afee + sale - dfee, sale=sale, gross=gross, pay=pay, ds=ds))
def xirr(flows, close_amt=None):
    d = [r['dt'] for r in rows]; v = [r['cf'] for r in rows] if flows is None else flows
    if close_amt: v = [close_amt, v[0] - close_amt] + v[1:]; d = [start] + d
    t = lambda x: (x - d[0]).days / 365.0; f = lambda r: sum(c / (1 + r) ** t(x) for c, x in zip(v, d)); lo, hi = -.95, 10.0
    for _ in range(200):
        mid = (lo + hi) / 2
        if f(lo) * f(mid) <= 0: hi = mid
        else: lo = mid
    return (lo + hi) / 2
eq0 = rows[0]['eqd']; irr = xirr(None, -eq0); uirr = xirr([r['u'] for r in rows], -(M[0]['land'] + M[0]['hard'] + M[0]['soft']))
contrib = sum(r['wfc'] for r in rows); dist = sum(r['wfd'] for r in rows)
# ---- waterfall (LP-IRR hurdles on dated flows, gross contributions)
gs = g('gpShare'); lps = 1 - gs; rt = [g('pref'), g('hurdle2'), g('hurdle3')]; tl = [g('t2LP'), g('t3LP'), g('t4LP')]; tg = g('gpCatchupTarget')
CR = 1.0 if S.get('gpCatchupRate') in (None, '') else min(1.0, max(0.0, float(S['gpCatchupRate']))); LPO = g('prefLPOnly') == 1
acct = [0, 0, 0]; cumCon = cumDist = cumProm = 0.0; lpcf = []; gpcf = []; tot = dict(lp=0, gp=0, promote=0, t1=0, cu=0, t2=0, t3=0, t4=0); prev = start
for i, r in enumerate(rows):
    days = (r['dt'] - prev).days; prev = r['dt']; con, d = r['wfc'], r['wfd']; cl = min(con, eq0) if i == 0 else 0; lc = con * lps; clc = cl * lps
    a = [(acct[k] + clc) * (1 + rt[k]) ** (days / 365.0) + (lc - clc) for k in range(3)]
    t1 = min(d, a[0]) if LPO else (min(d, a[0] / lps) if lps > 0 else d); lp1 = t1 if LPO else t1 * lps; cumCon += con; pre_p = max(0, (cumDist + t1) - cumCon); rem1 = max(0, d - t1)
    cu = ((min(rem1, max(0, (tg * pre_p - cumProm) / (CR - tg))) if CR > tg else rem1) if g('gpCatchup') else 0); lpcu = (1 - CR) * cu
    t2 = min(max(0, d - t1 - cu), max(0, a[1] - lp1 - lpcu) / tl[0]) if tl[0] > 0 else 0; lp2 = t2 * tl[0]
    t3 = min(max(0, d - t1 - cu - t2), max(0, a[2] - lp1 - lpcu - lp2) / tl[1]) if tl[1] > 0 else 0; lp3 = t3 * tl[1]
    t4 = max(0, d - t1 - cu - t2 - t3); lp4 = t4 * tl[2]; lpr = lp1 + lpcu + lp2 + lp3 + lp4
    acct = [max(0, a[k] - lpr) for k in range(3)]
    gpd = (0 if LPO else t1 * gs) + cu * CR + t2 * (1 - tl[0]) + t3 * (1 - tl[1]) + t4 * (1 - tl[2]); prom = max(0, gpd - gs * ((0 if LPO else t1) + cu + t2 + t3 + t4)); cumProm += prom; cumDist += t1 + cu + t2 + t3 + t4
    lpcf.append(-lc + lpr); gpcf.append(-con * gs + gpd); tot['lp'] += lpr; tot['gp'] += gpd; tot['promote'] += prom
    for k, v in zip(['t1', 'cu', 't2', 't3', 't4'], [t1, cu, t2, t3, t4]): tot[k] += v
lpirr = xirr(lpcf, -eq0 * lps); gpirr = xirr(gpcf, -eq0 * gs)
out = dict(unlev=unlev, hard=hard, soft=soft, commit=commit, upfront=upfront, capInt=capTot, excess=sum(z['exc'] for z in M), draws=sum(z['draw'] for z in M), overflow=sum(z['over'] for z in M), eqTarget=eqTarget, equityTotal=equity_total,
           uses=unlev + upfront + unusedTot + resFunded + capTot + sum(z['exc'] for z in M), unusedFees=unusedTot, resFunded=resFunded, balCap=(CEIL or commit), peak=max(z['end'] for z in M), prinDrawn=prin, noi_pre=noi_pre, noi_after=noi_after, egi=egi, grossSale=rows[-1]['gross'], sale=rows[-1]['sale'], payoff=rows[-1]['pay'], irr=irr, uirr=uirr, contrib=contrib, dist=dist, moic=dist / contrib,
           lpIRR=lpirr, gpIRR=gpirr, lpDist=tot['lp'], gpDist=tot['gp'], promote=tot['promote'], tiers={k: tot[k] for k in ['t1', 'cu', 't2', 't3', 't4']}, lpContrib=contrib * lps, gpContrib=contrib * gs,
           months=[dict(mo=z['mo'], need=z['need'], eq=z['eq'], draw=z['draw'], cap=z['cap'], exc=z['exc'], end=z['end']) for z in M])
print(json.dumps(out))
