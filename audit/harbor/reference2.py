#!/usr/bin/env python3
"""A second, independent implementation of BK Capital's documented development conventions, written from the deal's raw inputs only (never from the engine's outputs).
   It rebuilds: the cost ladder, the monthly cost curves, the facility sizing, the funding loop (equity first, interest capitalised to the commitment), the operating cash flow,
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
_cg = [t for t in ((S.get('_contingency') or {}).get('items') or [])]
def _f(v): return float(v) if v not in (None, '') else 0.0
cg_forecast = 0.0
for t in _cg:
    b = max(0, _f(t.get('budget'))); u = max(0, _f(t.get('used'))); cg_forecast += max(u, max(0, _f(t.get('forecast'))) if t.get('forecast') not in (None, '') else b)
CG_ON = any(max(0, _f(t.get('budget'))) > 0 for t in _cg) or cg_forecast > 0
contSpend = cg_forecast if CG_ON else 0.0
gc = trades * g('hardGCPct'); fee = (trades + gc) * g('hardContractorFeePct'); bonds = (trades + gc + fee) * g('hardRiskBondsPct'); hcont = 0.0 if CG_ON else (trades + gc + fee + bonds) * g('hardContPct'); hard = trades + gc + fee + bonds + hcont
RSV = {}; rsvTotal = 0.0
for t in (S.get('_reserves') or []):
    a = max(0, _f(t.get('amount')))
    if a <= 0: continue
    m = max(1, round(_f(t.get('month'))) or 1); pu = t.get('purpose') if t.get('purpose') in ('operating', 'interest', 'general') else 'general'; RSV.setdefault(m, dict(operating=0.0, interest=0.0, general=0.0))[pu] += a; rsvTotal += a
scn = 1 + g('scnSoftPct')
soft_sub = hard * g('sc_ae') + gsf * scn * sum(g(k) for k in ['sc_civil', 'sc_environmental', 'sc_entitlement', 'sc_permits', 'sc_legal', 'sc_retaxconst', 'sc_ocip', 'sc_marketing', 'sc_testing', 'sc_sustainability', 'sc_technology']) + (g('commercialArea') or gsf) * g('sc_ti') * scn + units * g('sc_ffe') * scn + price * g('sc_title') + hard * g('cmFeePct')
devfee = g('devFeePct') * (hard + soft_sub); soft = soft_sub + devfee + (soft_sub + devfee) * g('softContPct')
land, close, acq, pre = price, price * g('closingPct'), price * g('acqFeePct'), g('predevCarry')
unlev = land + close + acq + pre + hard + soft + contSpend
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
FX = str(S.get('conSizing') or 'ltc') == 'fixed' and g('conFixedCommit') > 0
if FX: commit = float(round(g('conFixedCommit')))
upfront = commit * feeFac + g('lenderLegal'); eqTarget = max(0, unlev + upfront + commit * intFac - commit) if commit > 0 else 9.9e14
CEIL = None
if FX:
    eqTarget = g('conEquityFirst') if g('conEquityFirst') > 0 else max(0, unlev - commit); FXCEIL = max(commit, g('conCeiling') or commit); FXCAP = bool(g('conCapToExit')) and not g('refiAtStab'); UNUSED = g('conUnusedFee')
if SW.get('fixed_facility'): commit, CEIL, eqTarget, upfront = 27_300_000.0, 34_000_000.0, 14_700_000.0, 0.0
RES = {1: 1_250_000.0, co: 750_000.0} if SW.get('reserves') else {}
# ---- funding loop
bal = cumEq = capTot = 0.0; cumPrin = cumEqCost = unusedTot = 0.0; M = []; rintBal = [0.0]; rintUsed = [0.0]; rsvFundedT = [0.0]
for mo in range(1, hold + 1):
    ld = (land + close + acq + pre) if mo == 1 else 0
    h = hard * curve(mo, preMo + 1, max(1, conMo), S.get('hardCurveMethod', 'S-Curve'), S.get('hardCurveSteepness', 7))
    pre_s = curve(mo, 1, preMo, S.get('softPreMethod', 'Straight-Line'), 1) if preMo > 0 else 0
    con_s = curve(mo, preMo + 1, max(1, conMo), S.get('softConMethod', 'S-Curve'), S.get('softConSteepness', 5)); lu_s = curve(mo, co + 1, luMo, S.get('softLeaseMethod', 'Straight-Line'), 1) if luMo > 0 else 0
    sf = soft * (.28 * pre_s + (.62 + (.28 if preMo == 0 else 0)) * con_s + .10 * lu_s)
    cnt = contSpend * curve(mo, preMo + 1, max(1, conMo), S.get('hardCurveMethod', 'S-Curve'), S.get('hardCurveSteepness', 7)); rm = RSV.get(mo) or dict(operating=0.0, interest=0.0, general=0.0); rfund = rm['operating'] + rm['interest'] + rm['general']
    fe = upfront if mo == preMo + 1 else 0; need = ld + h + cnt + sf + fe + RES.get(mo, 0) + rfund
    if FX:
        unused = UNUSED / 12 * max(0, commit - cumPrin) if (mo <= co and mo < payoffMo) else 0.0
        needCost = need - fe; eqCost = min(needCost, max(0, eqTarget - cumEqCost)); cumEqCost += eqCost; eqF = eqCost + fe + unused; needF = needCost + fe + unused
        interest = bal * rate / 12 if (commit > 0 and mo <= (hold if FXCAP else stab) and mo < payoffMo) else 0; cap = min(interest, max(0, FXCEIL - bal)); exc = max(0, interest - cap)
        draw = min(max(0, needCost - eqCost), max(0, commit - cumPrin), max(0, FXCEIL - bal - cap)) if (commit > 0 and mo < payoffMo) else 0; over = max(0, needF - eqF - draw)
        rintBal[0] += rm['interest']; useInt = min(rintBal[0], exc); rintBal[0] -= useInt; rintUsed[0] += useInt
        cumEq += eqF; cumPrin += draw; bal += cap + draw; capTot += cap; unusedTot += unused; rsvFundedT[0] += rfund
        M.append(dict(extra=0.0, mo=mo, land=ld, hard=h, cont=cnt, soft=sf, fees=fe, need=needF, eq=eqF, draw=draw, cap=cap, exc=exc, over=over, end=bal, unused=unused, rop=rm['operating'], rgen=rm['general'], rint=useInt)); continue
    eq = min(need, max(0, eqTarget - cumEq)); cumEq += eq
    interest = bal * rate / 12 if (commit > 0 and mo <= (hold if SW.get('cap_to_exit') else stab) and mo < payoffMo) else 0; cap = min(interest, max(0, (CEIL or commit) - bal)); exc = max(0, interest - cap)
    room = (CEIL - bal - cap) if CEIL else (commit - bal - cap)
    draw = min(max(0, need - eq), max(0, room)) if (commit > 0 and mo < payoffMo) else 0; over = max(0, need - eq - draw)
    extra = 0.0
    if CEIL:
        extra = (273_000.0 if mo == 1 else 0) + (0.005 / 12 * max(0, commit - (bal - capTot)) if mo <= co else 0)
    rintBal[0] += rm['interest']; useInt = min(rintBal[0], exc); rintBal[0] -= useInt; rintUsed[0] += useInt; rsvFundedT[0] += rfund
    bal += cap + draw; capTot += cap
    M.append(dict(extra=extra, mo=mo, land=ld, hard=h, cont=cnt, soft=sf, fees=fe, need=need, eq=eq, draw=draw, cap=cap, exc=exc, over=over, end=bal, rop=rm['operating'], rgen=rm['general'], rint=useInt))
equity_total = cumEq + sum(z['over'] + z['exc'] - z['rint'] for z in M)
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
held = commit > 0 and not g('refiAtStab'); conBal = (M[hold - 1]['end'] if (FX and FXCAP) else M[stab - 1]['end']) if held else 0; exitCap = g('exitCap'); saleCost = g('saleCostPct')
rows = []; OPRES = [750_000.0]; opB = [0.0]; genB = [0.0]
for mo in range(1, hold + 1):
    z = M[mo - 1]; op = mo >= stab; noi = curve_noi(mo); e_m = egi / 12 if op else ramp.get(mo, (0, 0))[0]; afee = e_m * g('assetMgmtPct')
    ds = conBal * rate / 12 if (held and mo > stab and not SW.get('cap_to_exit') and not (FX and FXCAP)) else 0; eqd = z['eq'] + z['over'] + z['exc'] - z['rint'] + z['extra']; sale = dfee = pay = gross = 0
    if mo == hold:
        gross = ((noi_after + res) if SW.get('exit_stab') else sum(curve_noi(k) for k in range(hold + 1, hold + 13))) / exitCap; sale = gross * (1 - saleCost); dfee = gross * g('dispositionFeePct'); pay = (z['end'] if SW.get('cap_to_exit') else conBal) if held or SW.get('cap_to_exit') else 0
    shortM = max(0.0, -(noi - afee - ds)); opB[0] += z['rop']; genB[0] += z['rgen']; uo = min(opB[0], shortM); opB[0] -= uo; ug = min(genB[0], shortM - uo); genB[0] -= ug
    rel = uo + ug + ((opB[0] + genB[0] + rintBal[0]) if mo == hold else 0.0)
    if SW.get('reserves'):
        oth = noi - afee - ds
        if oth < 0:
            use = min(OPRES[0], -oth); OPRES[0] -= use; rel += use    # the operating reserve pays the lease-up shortfall instead of the partners
        if mo == hold: rel += 2_000_000.0 - (750_000.0 - OPRES[0])   # the unused reserves are released at sale
    cf = -eqd + noi - afee - ds + sale - dfee - pay + rel; other_cf = cf + eqd
    ucost = z['land'] + z['hard'] + z.get('cont', 0) + z['soft']
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
acct = [0, 0, 0]; cumCon = cumDist = cumProm = capRet = 0.0; lpcf = []; gpcf = []; tot = dict(lp=0, gp=0, promote=0, t1=0, cu=0, t2=0, t3=0, t4=0); prev = start
for i, r in enumerate(rows):
    days = (r['dt'] - prev).days; prev = r['dt']; con, d = r['wfc'], r['wfd']; cl = min(con, eq0) if i == 0 else 0; lc = con * lps; clc = cl * lps
    a = [(acct[k] + clc) * (1 + rt[k]) ** (days / 365.0) + (lc - clc) for k in range(3)]
    lp_only = str(S.get('prefHolder') or 'both') == 'lp'
    if lp_only:
        K = max(0, cumCon + con - capRet); t1a = min(d, K); lp1a = t1a * lps; a1r = max(0, a[0] - lp1a); t1b = min(d - t1a, a1r); t1 = t1a + t1b; lp1 = lp1a + t1b; gpT1 = t1a * gs; capRet += t1a
    else:
        t1 = min(d, a[0] / lps) if lps > 0 else d; lp1 = t1 * lps; gpT1 = t1 * gs
    cumCon += con; pre_p = max(0, (cumDist + t1) - cumCon); rem1 = max(0, d - t1)
    r0 = g('gpCatchupRate'); rr = r0 if 0 < r0 < 1 else 1.0
    if not g('gpCatchup'): cu = 0.0
    elif rr >= 1: cu = min(rem1, max(0, (tg * pre_p - cumProm) / (1 - tg)))
    else:
        den = rr - gs - tg; cu = min(rem1, max(0, (tg * pre_p - cumProm) / den)) if den > 0 else rem1
    lpCU = (1 - rr) * cu; gpCU = rr * cu
    t2 = min(max(0, d - t1 - cu), max(0, a[1] - lp1 - lpCU) / tl[0]) if tl[0] > 0 else 0; lp2 = t2 * tl[0]
    t3 = min(max(0, d - t1 - cu - t2), max(0, a[2] - lp1 - lpCU - lp2) / tl[1]) if tl[1] > 0 else 0; lp3 = t3 * tl[1]
    t4 = max(0, d - t1 - cu - t2 - t3); lp4 = t4 * tl[2]; lpr = lp1 + lpCU + lp2 + lp3 + lp4
    acct = [max(0, a[k] - lpr) for k in range(3)]
    gpd = gpT1 + gpCU + t2 * (1 - tl[0]) + t3 * (1 - tl[1]) + t4 * (1 - tl[2]); prom = (gpd - gs * (t1 + cu + t2 + t3 + t4)) if lp_only else max(0, gpd - gs * (t1 + cu + t2 + t3 + t4)); cumProm += prom; cumDist += t1 + cu + t2 + t3 + t4
    lpcf.append(-lc + lpr); gpcf.append(-con * gs + gpd); tot['lp'] += lpr; tot['gp'] += gpd; tot['promote'] += prom
    for k, v in zip(['t1', 'cu', 't2', 't3', 't4'], [t1, cu, t2, t3, t4]): tot[k] += v
lpirr = xirr(lpcf, -eq0 * lps); gpirr = xirr(gpcf, -eq0 * gs)
out = dict(unlev=unlev, hard=hard, soft=soft, commit=commit, upfront=upfront, capInt=capTot, excess=sum(z['exc'] for z in M), draws=sum(z['draw'] for z in M), overflow=sum(z['over'] for z in M), eqTarget=eqTarget, equityTotal=equity_total,
           uses=unlev + upfront + unusedTot + rsvFundedT[0] + capTot + sum(z['exc'] for z in M), reserveFunded=rsvFundedT[0], rsvIntUsed=rintUsed[0], contSpend=contSpend, unusedFees=unusedTot, ceiling=(FXCEIL if FX else commit), noi_pre=noi_pre, noi_after=noi_after, egi=egi, grossSale=rows[-1]['gross'], sale=rows[-1]['sale'], payoff=rows[-1]['pay'], irr=irr, uirr=uirr, contrib=contrib, dist=dist, moic=dist / contrib,
           lpIRR=lpirr, gpIRR=gpirr, lpDist=tot['lp'], gpDist=tot['gp'], promote=tot['promote'], tiers={k: tot[k] for k in ['t1', 'cu', 't2', 't3', 't4']}, lpContrib=contrib * lps, gpContrib=contrib * gs,
           months=[dict(mo=z['mo'], need=z['need'], eq=z['eq'], draw=z['draw'], cap=z['cap'], exc=z['exc'], end=z['end']) for z in M])
print(json.dumps(out))
